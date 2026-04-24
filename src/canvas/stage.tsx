import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '@/state/canvas-store'
import { NodeRenderer } from '@/canvas/nodes'
import { CanvasTransformer } from '@/canvas/transformer'
import { Marquee, intersects } from '@/canvas/marquee'
import { TextEditor } from '@/canvas/text-editor'
import { Guides } from '@/canvas/guides'
import { computeSnap, type Bbox, type SnapGuide } from '@/composition/alignment'
import { FONTS_LOADED_EVENT } from '@/fonts/preload'
import type { CanvasNode, TextNode } from '@/canvas/types'

const MIN_SCALE = 0.1
const MAX_SCALE = 8

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [marquee, setMarquee] = useState<{
    startX: number
    startY: number
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const lastFitId = useRef(-1)

  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const viewport = useCanvasStore((s) => s.viewport)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const artboardBackground = useCanvasStore((s) => s.artboardBackground)
  const fitRequestId = useCanvasStore((s) => s.fitRequestId)
  const editingBooleanId = useCanvasStore((s) => s.editingBooleanId)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const select = useCanvasStore((s) => s.select)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const clearSelection = useCanvasStore((s) => s.clearSelection)
  const setEditingBooleanId = useCanvasStore((s) => s.setEditingBooleanId)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return
    const isInitial = lastFitId.current === -1
    if (!isInitial && lastFitId.current === fitRequestId) return
    const scale = Math.min(
      (size.width * 0.85) / stageWidth,
      (size.height * 0.85) / stageHeight,
      1,
    )
    setViewport({
      scale,
      x: (size.width - stageWidth * scale) / 2,
      y: (size.height - stageHeight * scale) / 2,
    })
    lastFitId.current = fitRequestId
  }, [size, stageWidth, stageHeight, fitRequestId, setViewport])

  useEffect(() => {
    const handler = () => {
      stageRef.current?.getLayers().forEach((l) => l.batchDraw())
    }
    window.addEventListener(FONTS_LOADED_EVENT, handler)
    return () => window.removeEventListener(FONTS_LOADED_EVENT, handler)
  }, [])

  const editingText = useMemo<TextNode | null>(() => {
    if (!editingTextId) return null
    const n = nodes.find((x) => x.id === editingTextId)
    return n && n.type === 'text' ? n : null
  }, [editingTextId, nodes])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const outermostAncestor = (id: string): string => {
    let current = nodeById.get(id)
    while (current?.parentId) {
      // While editing a boolean, stop at its direct child so clicks on children
      // select them individually instead of walking up to the boolean.
      if (editingBooleanId && current.parentId === editingBooleanId) return current.id
      const parent = nodeById.get(current.parentId)
      if (!parent) break
      current = parent
    }
    return current?.id ?? id
  }

  const handleSelectNode = (id: string, additive: boolean) => {
    const rootId = outermostAncestor(id)
    const root = nodeById.get(rootId)
    if (!root || root.locked) return
    if (additive) toggleSelect(rootId)
    else if (!selectedIds.includes(rootId)) select([rootId])
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = 1.05
      const oldScale = viewport.scale
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const mousePointTo = {
        x: (pointer.x - viewport.x) / oldScale,
        y: (pointer.y - viewport.y) / oldScale,
      }
      const direction = e.evt.deltaY > 0 ? -1 : 1
      let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))
      setViewport({
        scale: newScale,
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      })
    } else {
      setViewport({
        x: viewport.x - e.evt.deltaX,
        y: viewport.y - e.evt.deltaY,
      })
    }
  }

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    const clickedOnStage = e.target === stage || e.target.name() === 'artboard-bg'
    if (!clickedOnStage) return
    if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) clearSelection()
    if (editingBooleanId) setEditingBooleanId(null)
    const pos = stage.getRelativePointerPosition()
    if (!pos) return
    setMarquee({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, width: 0, height: 0 })
  }

  const handleStageMouseMove = () => {
    if (!marquee) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getRelativePointerPosition()
    if (!pos) return
    const x = Math.min(marquee.startX, pos.x)
    const y = Math.min(marquee.startY, pos.y)
    const width = Math.abs(pos.x - marquee.startX)
    const height = Math.abs(pos.y - marquee.startY)
    setMarquee({ ...marquee, x, y, width, height })
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    const target = e.target
    if (target === stage) return
    const layer = stage.getLayers()[0]
    if (!layer) return
    const dragged: Bbox = target.getClientRect({ relativeTo: layer, skipTransform: false })
    const others: Bbox[] = []
    const draggedId = target.id()
    const isDescendantOfDragged = (id: string): boolean => {
      let current = nodeById.get(id)
      while (current?.parentId) {
        if (current.parentId === draggedId) return true
        current = nodeById.get(current.parentId)
      }
      return false
    }
    for (const n of nodes) {
      if (n.id === draggedId || n.hidden || n.locked) continue
      if (n.parentId && n.parentId !== editingBooleanId) continue
      if (isDescendantOfDragged(n.id)) continue
      const kn = stage.findOne(`#${n.id}`)
      if (!kn) continue
      others.push(kn.getClientRect({ relativeTo: layer, skipTransform: false }))
    }
    const artboard: Bbox = { x: 0, y: 0, width: stageWidth, height: stageHeight }
    const threshold = 6 / viewport.scale
    const { dx, dy, guides: next } = computeSnap(dragged, others, artboard, threshold)
    if (dx !== 0) target.x(target.x() + dx)
    if (dy !== 0) target.y(target.y() + dy)
    setGuides(next)
  }

  const handleDragEnd = () => {
    setGuides([])
  }

  const handleStageMouseUp = () => {
    if (!marquee) return
    if (marquee.width > 2 && marquee.height > 2) {
      const stage = stageRef.current
      if (stage) {
        const hits = new Set<string>()
        for (const n of nodes) {
          if (n.locked || n.hidden) continue
          if (n.parentId && n.parentId !== editingBooleanId) continue
          const kn = stage.findOne(`#${n.id}`)
          if (!kn) continue
          const box = kn.getClientRect({ relativeTo: stage.getLayers()[0] })
          if (intersects(box, marquee)) hits.add(n.id)
        }
        select([...hits])
      }
    }
    setMarquee(null)
  }

  const childrenOf = useMemo(() => {
    const map = new Map<string | undefined, CanvasNode[]>()
    for (const n of nodes) {
      const key = n.parentId
      const arr = map.get(key)
      if (arr) arr.push(n)
      else map.set(key, [n])
    }
    return map
  }, [nodes])

  const renderTree = (node: CanvasNode) => {
    if (node.hidden) return null
    const childNodes = childrenOf.get(node.id)
    if (node.type === 'group') {
      return (
        <NodeRenderer
          key={node.id}
          node={node}
          editing={false}
          onSelect={handleSelectNode}
          onStartTextEdit={setEditingTextId}
          onEnterBoolean={setEditingBooleanId}
        >
          {childNodes?.map(renderTree)}
        </NodeRenderer>
      )
    }
    if (node.type === 'boolean' && editingBooleanId === node.id) {
      // Edit mode: render the cached result ghosted (non-interactive reference),
      // then render its children on top, fully interactive.
      return (
        <Fragment key={node.id}>
          <NodeRenderer
            node={node}
            editing={false}
            ghosted
            onSelect={handleSelectNode}
            onStartTextEdit={setEditingTextId}
            onEnterBoolean={setEditingBooleanId}
          />
          {childNodes?.map(renderTree)}
        </Fragment>
      )
    }
    return (
      <NodeRenderer
        key={node.id}
        node={node}
        editing={editingTextId === node.id}
        onSelect={handleSelectNode}
        onStartTextEdit={setEditingTextId}
        onEnterBoolean={setEditingBooleanId}
      />
    )
  }

  const topLevelNodes = useMemo(() => nodes.filter((n) => !n.parentId), [nodes])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <Layer>
            <Rect
              name="artboard-bg"
              x={0}
              y={0}
              width={stageWidth}
              height={stageHeight}
              fill={artboardBackground}
              shadowColor="rgba(0,0,0,0.3)"
              shadowBlur={20}
              shadowOpacity={1}
              listening
            />
            {topLevelNodes.map(renderTree)}
            <CanvasTransformer selectedIds={selectedIds} />
            <Marquee rect={marquee} />
            <Guides guides={guides} scale={viewport.scale} />
          </Layer>
        </Stage>
      )}
      {editingText && stageRef.current && (
        <TextEditor
          node={editingText}
          stage={stageRef.current}
          onClose={() => setEditingTextId(null)}
        />
      )}
    </div>
  )
}
