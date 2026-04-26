import { useEffect, useRef, useState } from 'react'
import { Circle, Group, Line, Path, Rect } from 'react-konva'
import type Konva from 'konva'
import type { PathNode } from '@/canvas/types'
import { useCanvasStore } from '@/state/canvas-store'
import { fillKonvaProps, strokeKonvaProps } from '@/composition/fills'
import {
  parseSegments,
  segmentsToPathData,
  isClosedPath,
  insertSegmentAt,
  type Segment,
} from '@/composition/path-edit-ops'

type Props = {
  node: PathNode
  scale: number
}

const OUTLINE_COLOR = '#818cf8'
const ANCHOR_FILL_SELECTED = '#818cf8'
const ANCHOR_FILL = '#0a0a0a'
const HANDLE_COLOR = '#818cf8'

export function PathEditOverlay({ node, scale }: Props) {
  const selectedIndices = useCanvasStore((s) => s.pathEditState?.selectedSegmentIndices ?? [])
  const setSelected = useCanvasStore((s) => s.setPathEditSelectedIndices)
  const updateNode = useCanvasStore((s) => s.updateNode)

  // Local segment state — source of truth during edit. Synced from node.data
  // when the edited node changes OR when node.data changes (undo/redo) but not
  // while actively dragging.
  const [segments, setSegments] = useState<Segment[]>(() => parseSegments(node.data))
  const [closed, setClosed] = useState<boolean>(() => isClosedPath(node.data))
  const draggingRef = useRef(false)

  useEffect(() => {
    if (draggingRef.current) return
    setSegments(parseSegments(node.data))
    setClosed(isClosedPath(node.data))
  }, [node.data])

  const selSet = new Set(selectedIndices)
  const anchorSize = 8 / scale
  const strokeWidth = 1.5 / scale
  const handleDotRadius = 3 / scale

  const previewData = segmentsToPathData(segments, closed)

  const commit = (next: Segment[]) => {
    const data = segmentsToPathData(next, closed)
    if (data) updateNode(node.id, { data })
  }

  const updateSegment = (index: number, patch: Partial<Segment>) => {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  return (
    <Group x={node.x} y={node.y} rotation={node.rotation} listening>
      {/* Live preview: fill + stroke match the node's own style so the edit
          feels "in place" rather than against a ghost outline. */}
      <Path
        {...fillKonvaProps(node.fill)}
        {...strokeKonvaProps(node.stroke)}
        data={previewData}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineCap={node.strokeCap ?? 'butt'}
        lineJoin={node.strokeJoin ?? 'miter'}
        listening={false}
      />
      {/* Selection outline on top of the preview */}
      <Path data={previewData} stroke={OUTLINE_COLOR} strokeWidth={strokeWidth} listening={false} />

      {/* Invisible hit path for double-click-to-insert. hitStrokeWidth extends the
          click target well beyond the visible stroke so users don't need pixel
          precision. Anchors sit on top and eat their own clicks first. */}
      <Path
        data={previewData}
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={strokeWidth}
        hitStrokeWidth={12 / scale}
        fillEnabled={false}
        onDblClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
          const group = e.target.getParent()
          const pos = group?.getRelativePointerPosition()
          if (!pos) return
          const inserted = insertSegmentAt(
            segmentsToPathData(segments, closed),
            pos.x,
            pos.y,
            12 / scale,
          )
          if (!inserted) return
          const nextSegs = parseSegments(inserted.data)
          setSegments(nextSegs)
          updateNode(node.id, { data: inserted.data })
          setSelected([inserted.insertedIndex])
        }}
      />

      {/* Handle lollipops for selected anchors. Hidden when zoomed way out so
          the canvas doesn't get cluttered with tiny indicators. */}
      {scale >= 0.25 && segments.map((seg, i) => {
        if (!selSet.has(i)) return null
        return (
          <HandleLollipops
            key={`hl-${i}`}
            seg={seg}
            index={i}
            strokeWidth={strokeWidth}
            dotRadius={handleDotRadius}
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragMove={(which, dx, dy, mirror) => {
              setSegments((prev) =>
                prev.map((s, idx) => {
                  if (idx !== i) return s
                  if (which === 'out') {
                    return mirror && s.handleIn
                      ? { ...s, handleOut: { dx, dy }, handleIn: { dx: -dx, dy: -dy } }
                      : { ...s, handleOut: { dx, dy } }
                  }
                  return mirror && s.handleOut
                    ? { ...s, handleIn: { dx, dy }, handleOut: { dx: -dx, dy: -dy } }
                    : { ...s, handleIn: { dx, dy } }
                }),
              )
            }}
            onDragEnd={() => {
              draggingRef.current = false
              setSegments((prev) => {
                commit(prev)
                return prev
              })
            }}
          />
        )
      })}

      {/* Anchor squares */}
      {segments.map((seg, i) => {
        const isSelected = selSet.has(i)
        return (
          <Rect
            key={`a-${i}`}
            name="path-anchor"
            x={seg.x - anchorSize / 2}
            y={seg.y - anchorSize / 2}
            width={anchorSize}
            height={anchorSize}
            fill={isSelected ? ANCHOR_FILL_SELECTED : ANCHOR_FILL}
            stroke={OUTLINE_COLOR}
            strokeWidth={strokeWidth}
            draggable
            onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.cancelBubble = true
              const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey
              if (additive) {
                const next = selSet.has(i)
                  ? selectedIndices.filter((x) => x !== i)
                  : [...selectedIndices, i]
                setSelected(next)
              } else if (!isSelected) {
                setSelected([i])
              }
            }}
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
              const nx = e.target.x() + anchorSize / 2
              const ny = e.target.y() + anchorSize / 2
              updateSegment(i, { x: nx, y: ny })
            }}
            onDragEnd={() => {
              draggingRef.current = false
              setSegments((prev) => {
                commit(prev)
                return prev
              })
            }}
          />
        )
      })}
    </Group>
  )
}

function HandleLollipops({
  seg,
  index,
  strokeWidth,
  dotRadius,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  seg: Segment
  index: number
  strokeWidth: number
  dotRadius: number
  onDragStart: () => void
  onDragMove: (which: 'in' | 'out', dx: number, dy: number, mirror: boolean) => void
  onDragEnd: () => void
}) {
  return (
    <>
      {seg.handleIn && (
        <HandleDot
          anchorX={seg.x}
          anchorY={seg.y}
          dx={seg.handleIn.dx}
          dy={seg.handleIn.dy}
          which="in"
          strokeWidth={strokeWidth}
          dotRadius={dotRadius}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          segIndex={index}
        />
      )}
      {seg.handleOut && (
        <HandleDot
          anchorX={seg.x}
          anchorY={seg.y}
          dx={seg.handleOut.dx}
          dy={seg.handleOut.dy}
          which="out"
          strokeWidth={strokeWidth}
          dotRadius={dotRadius}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          segIndex={index}
        />
      )}
    </>
  )
}

function HandleDot({
  anchorX,
  anchorY,
  dx,
  dy,
  which,
  strokeWidth,
  dotRadius,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  anchorX: number
  anchorY: number
  dx: number
  dy: number
  which: 'in' | 'out'
  strokeWidth: number
  dotRadius: number
  onDragStart: () => void
  onDragMove: (which: 'in' | 'out', dx: number, dy: number, mirror: boolean) => void
  onDragEnd: () => void
  segIndex: number
}) {
  return (
    <>
      <Line
        points={[anchorX, anchorY, anchorX + dx, anchorY + dy]}
        stroke={HANDLE_COLOR}
        strokeWidth={strokeWidth}
        listening={false}
      />
      <Circle
        x={anchorX + dx}
        y={anchorY + dy}
        radius={dotRadius}
        fill={HANDLE_COLOR}
        draggable
        onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
        }}
        onDragStart={onDragStart}
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          const ndx = e.target.x() - anchorX
          const ndy = e.target.y() - anchorY
          onDragMove(which, ndx, ndy, !e.evt.altKey)
        }}
        onDragEnd={onDragEnd}
      />
    </>
  )
}

