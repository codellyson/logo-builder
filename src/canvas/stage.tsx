import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '@/state/canvas-store'
import { NodeRenderer } from '@/canvas/nodes'
import { CanvasTransformer } from '@/canvas/transformer'
import { Marquee, intersects } from '@/canvas/marquee'
import { TextEditor } from '@/canvas/text-editor'
import { Guides } from '@/canvas/guides'
import { PenDraftPreview } from '@/canvas/pen-draft-preview'
import { PathEditOverlay } from '@/canvas/path-edit-overlay'
import { GradientHandleOverlay } from '@/canvas/gradient-handle-overlay'
import { computeSnap, type Bbox, type SnapGuide } from '@/composition/alignment'
import { constrainToAxis } from '@/composition/geom'
import { FONTS_LOADED_EVENT } from '@/fonts/preload'
import type { CanvasNode, TextNode } from '@/canvas/types'

const MIN_SCALE = 0.1
const MAX_SCALE = 8

// Last placed-or-pending anchor in a pen draft, for Shift-constrain reference.
function lastAnchor(
  draft: { segments: { x: number; y: number }[]; pending: { x: number; y: number } | null },
): { x: number; y: number } | null {
  if (draft.pending) return draft.pending
  if (draft.segments.length > 0) return draft.segments[draft.segments.length - 1]
  return null
}

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
  // Live Konva transform of the currently-dragged or transforming node.
  // The store only commits x/y on dragEnd and bakes scale on transformEnd,
  // so overlays keyed off node.x/y/rotation (the gradient handles) would lag
  // behind during the gesture without this. Cleared on gesture end.
  const [liveTransform, setLiveTransform] = useState<{
    id: string
    x: number
    y: number
    rotation: number
    scaleX: number
    scaleY: number
  } | null>(null)
  const lastFitId = useRef(-1)

  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const viewport = useCanvasStore((s) => s.viewport)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const artboardBackground = useCanvasStore((s) => s.artboardBackground)
  const fitRequestId = useCanvasStore((s) => s.fitRequestId)
  const editingBooleanId = useCanvasStore((s) => s.editingBooleanId)
  const toolMode = useCanvasStore((s) => s.toolMode)
  const penDraft = useCanvasStore((s) => s.penDraft)
  const pathEditState = useCanvasStore((s) => s.pathEditState)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const select = useCanvasStore((s) => s.select)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const clearSelection = useCanvasStore((s) => s.clearSelection)
  const setEditingBooleanId = useCanvasStore((s) => s.setEditingBooleanId)
  const penBeginAnchor = useCanvasStore((s) => s.penBeginAnchor)
  const penUpdatePendingHandle = useCanvasStore((s) => s.penUpdatePendingHandle)
  const penFinalizePending = useCanvasStore((s) => s.penFinalizePending)
  const penSetCursor = useCanvasStore((s) => s.penSetCursor)
  const penCommit = useCanvasStore((s) => s.penCommit)
  const exitPathEdit = useCanvasStore((s) => s.exitPathEdit)
  const penDragState = useRef<{ anchorX: number; anchorY: number; closedOnDown: boolean } | null>(null)

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

  const snapPointForPen = (pos: { x: number; y: number }) => {
    const stage = stageRef.current
    if (!stage) return { x: pos.x, y: pos.y, guides: [] as SnapGuide[] }
    const layer = stage.getLayers()[0]
    if (!layer) return { x: pos.x, y: pos.y, guides: [] as SnapGuide[] }
    const others: Bbox[] = []
    for (const n of nodes) {
      if (n.hidden || n.locked) continue
      if (n.parentId) continue
      const kn = stage.findOne(`#${n.id}`)
      if (!kn) continue
      others.push(kn.getClientRect({ relativeTo: layer, skipTransform: false }))
    }
    const artboard: Bbox = { x: 0, y: 0, width: stageWidth, height: stageHeight }
    const threshold = 6 / viewport.scale
    const dragged: Bbox = { x: pos.x, y: pos.y, width: 0, height: 0 }
    const { dx, dy, guides } = computeSnap(dragged, others, artboard, threshold)
    return { x: pos.x + dx, y: pos.y + dy, guides }
  }

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current
    if (!stage) return

    // Pen mode: intercept clicks. Mousedown starts a pending anchor; drag shapes
    // its handles; mouseup finalizes. Clicking the first anchor closes the path.
    if (toolMode === 'pen') {
      const raw = stage.getRelativePointerPosition()
      if (!raw) return
      if (e.target.name() === 'pen-first-anchor' && penDraft && penDraft.segments.length >= 2) {
        penDragState.current = { anchorX: raw.x, anchorY: raw.y, closedOnDown: true }
        setGuides([])
        penCommit(true)
        return
      }
      const constrained = e.evt.shiftKey && penDraft ? constrainToAxis(raw, lastAnchor(penDraft)) : raw
      const { x, y } = snapPointForPen(constrained)
      penBeginAnchor(x, y)
      penDragState.current = { anchorX: x, anchorY: y, closedOnDown: false }
      setGuides([])
      return
    }

    const clickedOnStage = e.target === stage || e.target.name() === 'artboard-bg'
    if (!clickedOnStage) return
    // Empty-stage click in path edit mode exits the mode entirely.
    if (toolMode === 'edit-path') {
      exitPathEdit()
      return
    }
    if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) clearSelection()
    if (editingBooleanId) setEditingBooleanId(null)
    const pos = stage.getRelativePointerPosition()
    if (!pos) return
    setMarquee({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, width: 0, height: 0 })
  }

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current
    if (!stage) return

    if (toolMode === 'pen' && penDraft) {
      const pos = stage.getRelativePointerPosition()
      if (!pos) return
      const drag = penDragState.current
      if (drag && !drag.closedOnDown && penDraft.pending) {
        // Mid-drag (extruding a handle): do not snap, just feed raw delta.
        penSetCursor(pos.x, pos.y)
        setGuides([])
        const dx = pos.x - drag.anchorX
        const dy = pos.y - drag.anchorY
        if (Math.hypot(dx, dy) >= 3) {
          penUpdatePendingHandle(dx, dy, e.evt.altKey)
        }
      } else {
        // Shift-constrain to 0° / 45° / 90° from the last placed anchor.
        const constrained = e.evt.shiftKey && penDraft ? constrainToAxis(pos, lastAnchor(penDraft)) : pos
        const snapped = snapPointForPen(constrained)
        penSetCursor(snapped.x, snapped.y)
        setGuides(snapped.guides)
      }
      return
    }

    if (!marquee) return
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
    if (draggedId) {
      setLiveTransform({
        id: draggedId,
        x: target.x(),
        y: target.y(),
        rotation: target.rotation(),
        scaleX: target.scaleX(),
        scaleY: target.scaleY(),
      })
    }
  }

  const handleDragEnd = () => {
    setGuides([])
    // Defer clearing liveTransform until the store has flushed the new
    // node.x/y from NodeRenderer's onDragEnd. Otherwise the overlay falls
    // back to the pre-drag stored coords for one frame, causing a snap.
    requestAnimationFrame(() => setLiveTransform(null))
  }

  const handleTransform = (e: Konva.KonvaEventObject<Event>) => {
    const t = e.target
    const stage = stageRef.current
    if (!stage || t === stage) return
    const id = t.id()
    if (!id) return
    setLiveTransform({
      id,
      x: t.x(),
      y: t.y(),
      rotation: t.rotation(),
      scaleX: t.scaleX(),
      scaleY: t.scaleY(),
    })
  }

  const handleTransformEnd = () => {
    // bakeScale runs in NodeRenderer's onTransformEnd before this fires.
    // Defer the clear so the baked store values land before the overlay
    // falls back, same pattern as drag.
    requestAnimationFrame(() => setLiveTransform(null))
  }

  const handleStageMouseUp = () => {
    if (toolMode === 'pen') {
      const drag = penDragState.current
      penDragState.current = null
      if (drag && !drag.closedOnDown) penFinalizePending()
      setGuides([])
      return
    }

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
    // The path being edited is rendered by PathEditOverlay instead so edits
    // appear live without a stale base path peeking through.
    if (pathEditState && pathEditState.nodeId === node.id) return null
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
          onTransform={handleTransform}
          onTransformEnd={handleTransformEnd}
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
            {toolMode === 'pen' && penDraft && (
              <PenDraftPreview draft={penDraft} scale={viewport.scale} />
            )}
            {toolMode === 'edit-path' && pathEditState && (() => {
              const n = nodes.find((x) => x.id === pathEditState.nodeId)
              return n && n.type === 'path' ? (
                <PathEditOverlay node={n} scale={viewport.scale} />
              ) : null
            })()}
            {/* Gradient handles — visible when a single node with a linear
                or radial fill is selected and we're in plain select mode
                (not pen, not edit-path). */}
            {toolMode === 'select' && selectedIds.length === 1 && (() => {
              const n = nodes.find((x) => x.id === selectedIds[0])
              if (!n || n.type === 'group' || n.type === 'line' || n.type === 'icon') return null
              if (!('fill' in n) || !n.fill) return null
              if (n.fill.type !== 'linear' && n.fill.type !== 'radial') return null
              const live = liveTransform?.id === n.id ? liveTransform : null
              return (
                <GradientHandleOverlay
                  node={n}
                  fill={n.fill}
                  scale={viewport.scale}
                  liveX={live?.x}
                  liveY={live?.y}
                  liveRotation={live?.rotation}
                  liveScaleX={live?.scaleX}
                  liveScaleY={live?.scaleY}
                />
              )
            })()}
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
