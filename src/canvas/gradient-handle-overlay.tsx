import { useEffect, useRef, useState } from 'react'
import { Circle, Group, Line } from 'react-konva'
import type Konva from 'konva'
import type { CanvasNode, ColorStop, LinearFill, RadialFill } from '@/canvas/types'
import { useCanvasStore } from '@/state/canvas-store'
import { constrainToAxis } from '@/composition/geom'

type Props = {
  node: CanvasNode
  fill: LinearFill | RadialFill
  scale: number
  // Live Konva transform of the node during drag or resize/rotate. Overrides
  // node.x / node.y / node.rotation, and applies a transient scale to the
  // overlay's Group so the gradient line stretches with the shape during a
  // Transformer gesture (the store only commits these on gesture end).
  liveX?: number
  liveY?: number
  liveRotation?: number
  liveScaleX?: number
  liveScaleY?: number
}

const LINE_COLOR = '#818cf8'
const HANDLE_FILL = '#0a0a0a'
const HANDLE_STROKE = '#818cf8'
const FOCAL_STROKE = '#f59e0b'

type Pt = { x: number; y: number }

export function GradientHandleOverlay(props: Props) {
  // Group scaleX/Y default to 1 so handles stay zoom-invariant at rest. The
  // 1/scale sizing on dots/lines compensates for stage zoom, but during a
  // resize gesture we want the gradient geometry to scale *with* the shape.
  const groupScaleX = props.liveScaleX ?? 1
  const groupScaleY = props.liveScaleY ?? 1

  return (
    <Group
      x={props.liveX ?? props.node.x}
      y={props.liveY ?? props.node.y}
      rotation={props.liveRotation ?? props.node.rotation}
      scaleX={groupScaleX}
      scaleY={groupScaleY}
      listening
    >
      {props.fill.type === 'linear' ? (
        <LinearHandles node={props.node} fill={props.fill} scale={props.scale} />
      ) : (
        <RadialHandles node={props.node} fill={props.fill} scale={props.scale} />
      )}
    </Group>
  )
}

// ----- Linear -----
//
// Mirrors the path-edit-overlay pattern: local state for the gradient
// endpoints during a drag, draggingRef suppresses the prop-sync effect so the
// drag isn't yanked back by upstream renders, and we commit a single store
// update on dragEnd so undo records one entry per drag (not 60).

function LinearHandles({
  node,
  fill,
  scale,
}: {
  node: CanvasNode
  fill: LinearFill
  scale: number
}) {
  const updateNode = useCanvasStore((s) => s.updateNode)

  const [local, setLocal] = useState<{ start: Pt; end: Pt; stops: ColorStop[] }>(() => ({
    start: { ...fill.start },
    end: { ...fill.end },
    stops: fill.stops.map((s) => ({ ...s })),
  }))
  const draggingRef = useRef(false)

  useEffect(() => {
    if (draggingRef.current) return
    setLocal({
      start: { ...fill.start },
      end: { ...fill.end },
      stops: fill.stops.map((s) => ({ ...s })),
    })
  }, [fill.start, fill.end, fill.stops])

  const lineWidth = 1.5 / scale
  const handleRadius = 6 / scale
  const stopDotRadius = 4 / scale

  const commit = (next: typeof local) => {
    updateNode(node.id, {
      fill: { ...fill, start: next.start, end: next.end, stops: next.stops },
    })
  }

  // Project a point onto the line a→b, returning t ∈ [0, 1] of closest point.
  const projectT = (p: Pt, a: Pt, b: Pt): number => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return 0
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    return Math.max(0, Math.min(1, t))
  }

  return (
    <>
      <Line
        points={[local.start.x, local.start.y, local.end.x, local.end.y]}
        stroke={LINE_COLOR}
        strokeWidth={lineWidth}
        listening={false}
      />

      {local.stops.map((s, i) => {
        const x = local.start.x + (local.end.x - local.start.x) * s.offset
        const y = local.start.y + (local.end.y - local.start.y) * s.offset
        return (
          <StopDot
            key={`stop-${i}`}
            x={x}
            y={y}
            radius={stopDotRadius}
            strokeWidth={lineWidth}
            color={s.color}
            canDelete={local.stops.length > 2}
            onAltClick={() => {
              const next = { ...local, stops: local.stops.filter((_, idx) => idx !== i) }
              setLocal(next)
              commit(next)
            }}
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragMove={(p, target) => {
              const t = projectT(p, local.start, local.end)
              const px = local.start.x + (local.end.x - local.start.x) * t
              const py = local.start.y + (local.end.y - local.start.y) * t
              target.x(px)
              target.y(py)
              setLocal((prev) => ({
                ...prev,
                stops: prev.stops.map((sp, idx) => (idx === i ? { ...sp, offset: t } : sp)),
              }))
            }}
            onDragEnd={() => {
              draggingRef.current = false
              setLocal((prev) => {
                commit(prev)
                return prev
              })
            }}
          />
        )
      })}

      <EndpointHandle
        pos={local.start}
        anchor={local.end}
        radius={handleRadius}
        strokeWidth={lineWidth}
        onDragStart={() => {
          draggingRef.current = true
        }}
        onDragMove={(pos) => setLocal((prev) => ({ ...prev, start: pos }))}
        onDragEnd={() => {
          draggingRef.current = false
          setLocal((prev) => {
            commit(prev)
            return prev
          })
        }}
      />
      <EndpointHandle
        pos={local.end}
        anchor={local.start}
        radius={handleRadius}
        strokeWidth={lineWidth}
        onDragStart={() => {
          draggingRef.current = true
        }}
        onDragMove={(pos) => setLocal((prev) => ({ ...prev, end: pos }))}
        onDragEnd={() => {
          draggingRef.current = false
          setLocal((prev) => {
            commit(prev)
            return prev
          })
        }}
      />
    </>
  )
}

// Interactive stop dot for both linear and radial overlays. Drag → moves
// along the gradient axis (parent decides projection). Alt-click → delete.
// Mouse-down with no modifier just starts a drag; the alt-click branch
// short-circuits before calling onDragStart so the store sees a single
// commit per delete.
function StopDot({
  x,
  y,
  radius,
  strokeWidth,
  color,
  canDelete,
  onAltClick,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  x: number
  y: number
  radius: number
  strokeWidth: number
  color: string
  canDelete: boolean
  onAltClick: () => void
  onDragStart: () => void
  onDragMove: (pos: Pt, target: Konva.Node) => void
  onDragEnd: () => void
}) {
  return (
    <Circle
      x={x}
      y={y}
      radius={radius}
      fill={color}
      stroke={LINE_COLOR}
      strokeWidth={strokeWidth}
      draggable
      onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        if (e.evt.altKey && canDelete) {
          // Mark it so the dragstart that Konva fires next is suppressed.
          // (Konva starts a drag from any mousedown on a draggable; we want
          // the alt-click to delete and not also kick off a drag.)
          ;(e.target as Konva.Node & { _altDelete?: boolean })._altDelete = true
          onAltClick()
        }
      }}
      onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
        const t = e.target as Konva.Node & { _altDelete?: boolean }
        if (t._altDelete) {
          t._altDelete = false
          t.stopDrag()
          return
        }
        onDragStart()
      }}
      onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
        onDragMove({ x: e.target.x(), y: e.target.y() }, e.target)
      }}
      onDragEnd={onDragEnd}
    />
  )
}

function EndpointHandle({
  pos,
  anchor,
  radius,
  strokeWidth,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  pos: Pt
  // The opposite endpoint — fixed during this drag — used as the constraint
  // anchor when Shift is held (so the line snaps to 0° / 45° / 90°).
  anchor: Pt
  radius: number
  strokeWidth: number
  onDragStart: () => void
  onDragMove: (pos: Pt) => void
  onDragEnd: () => void
}) {
  return (
    <Circle
      x={pos.x}
      y={pos.y}
      radius={radius}
      fill={HANDLE_FILL}
      stroke={HANDLE_STROKE}
      strokeWidth={strokeWidth * 1.5}
      draggable
      onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
      }}
      onDragStart={onDragStart}
      onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
        const raw = { x: e.target.x(), y: e.target.y() }
        const next = e.evt.shiftKey ? constrainToAxis(raw, anchor) : raw
        if (e.evt.shiftKey) {
          e.target.x(next.x)
          e.target.y(next.y)
        }
        onDragMove(next)
      }}
      onDragEnd={onDragEnd}
    />
  )
}

// ----- Radial -----
//
// Three handles: center, radius (always at angle 0 from center for visual
// consistency — drag distance defines the new radius), and focal. Focal is
// only rendered once detached. Default = focal at center, no separate
// handle. Alt-drag the center to detach focal at the *current* center
// position (so focal stays put while the center moves).

type RadialState = {
  center: Pt
  radius: number
  // null = linked (focal === center, derived). non-null = detached.
  focal: Pt | null
  stops: ColorStop[]
}

function RadialHandles({
  node,
  fill,
  scale,
}: {
  node: CanvasNode
  fill: RadialFill
  scale: number
}) {
  const updateNode = useCanvasStore((s) => s.updateNode)

  const [state, setState] = useState<RadialState>(() => ({
    center: { ...fill.center },
    radius: fill.radius,
    focal: fill.focal ? { ...fill.focal } : null,
    stops: fill.stops.map((s) => ({ ...s })),
  }))
  const draggingRef = useRef(false)

  useEffect(() => {
    if (draggingRef.current) return
    setState({
      center: { ...fill.center },
      radius: fill.radius,
      focal: fill.focal ? { ...fill.focal } : null,
      stops: fill.stops.map((s) => ({ ...s })),
    })
  }, [fill.center, fill.radius, fill.focal, fill.stops])

  const lineWidth = 1.5 / scale
  const handleRadius = 6 / scale
  const stopDotRadius = 4 / scale

  const commit = (s: RadialState) => {
    updateNode(node.id, {
      fill: {
        ...fill,
        center: s.center,
        radius: s.radius,
        focal: s.focal ?? undefined,
        stops: s.stops,
      },
    })
  }

  const radiusHandlePos: Pt = {
    x: state.center.x + state.radius,
    y: state.center.y,
  }

  return (
    <>
      {/* Faint preview circle at radius. */}
      <Circle
        x={state.center.x}
        y={state.center.y}
        radius={state.radius}
        stroke={LINE_COLOR}
        strokeWidth={lineWidth}
        listening={false}
      />

      {/* Stop dots along the center → radius-edge ray. Drag projects the
          dragged point onto the ray and converts to a [0, 1] offset along
          the radius. Alt-click deletes (when >2 stops). */}
      {state.stops.map((s, i) => {
        const x = state.center.x + (radiusHandlePos.x - state.center.x) * s.offset
        const y = state.center.y + (radiusHandlePos.y - state.center.y) * s.offset
        return (
          <StopDot
            key={`stop-${i}`}
            x={x}
            y={y}
            radius={stopDotRadius}
            strokeWidth={lineWidth}
            color={s.color}
            canDelete={state.stops.length > 2}
            onAltClick={() => {
              const next = { ...state, stops: state.stops.filter((_, idx) => idx !== i) }
              setState(next)
              commit(next)
            }}
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragMove={(p, target) => {
              const dx = p.x - state.center.x
              const dy = p.y - state.center.y
              const dist = Math.hypot(dx, dy)
              const t = state.radius === 0 ? 0 : Math.max(0, Math.min(1, dist / state.radius))
              // Pin to the radius ray (rightward) so the dot can't wander
              // into 2D and the user always sees it on the visualization line.
              const px = state.center.x + state.radius * t
              const py = state.center.y
              target.x(px)
              target.y(py)
              setState((prev) => ({
                ...prev,
                stops: prev.stops.map((sp, idx) => (idx === i ? { ...sp, offset: t } : sp)),
              }))
            }}
            onDragEnd={() => {
              draggingRef.current = false
              setState((prev) => {
                commit(prev)
                return prev
              })
            }}
          />
        )
      })}

      {/* Center handle — drag moves center; Alt-drag detaches focal at the
          original center position so focal stays put while center moves. */}
      <Circle
        x={state.center.x}
        y={state.center.y}
        radius={handleRadius}
        fill={HANDLE_FILL}
        stroke={HANDLE_STROKE}
        strokeWidth={lineWidth * 1.5}
        draggable
        onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
        }}
        onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
          draggingRef.current = true
          if (e.evt.altKey) {
            setState((prev) =>
              prev.focal ? prev : { ...prev, focal: { ...prev.center } },
            )
          }
        }}
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          const next = { x: e.target.x(), y: e.target.y() }
          setState((prev) => ({ ...prev, center: next }))
        }}
        onDragEnd={() => {
          draggingRef.current = false
          setState((prev) => {
            commit(prev)
            return prev
          })
        }}
      />

      {/* Radius handle — at center+(radius, 0). Drag distance from center
          becomes the new radius; the handle is pinned to the rightward axis
          during the drag so the user always sees it on a clean horizontal. */}
      <Circle
        x={radiusHandlePos.x}
        y={radiusHandlePos.y}
        radius={handleRadius * 0.75}
        fill={HANDLE_FILL}
        stroke={HANDLE_STROKE}
        strokeWidth={lineWidth * 1.5}
        draggable
        onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true
        }}
        onDragStart={() => {
          draggingRef.current = true
        }}
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          const dx = e.target.x() - state.center.x
          const dy = e.target.y() - state.center.y
          const r = Math.max(1, Math.hypot(dx, dy))
          // Pin to angle 0 visually so the handle stays on a horizontal ray.
          e.target.x(state.center.x + r)
          e.target.y(state.center.y)
          setState((prev) => ({ ...prev, radius: r }))
        }}
        onDragEnd={() => {
          draggingRef.current = false
          setState((prev) => {
            commit(prev)
            return prev
          })
        }}
      />

      {/* Focal handle — only visible once detached. Amber stroke
          distinguishes it from center/radius handles. */}
      {state.focal && (
        <Circle
          x={state.focal.x}
          y={state.focal.y}
          radius={handleRadius * 0.75}
          fill={HANDLE_FILL}
          stroke={FOCAL_STROKE}
          strokeWidth={lineWidth * 1.5}
          draggable
          onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true
          }}
          onDragStart={() => {
            draggingRef.current = true
          }}
          onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
            const next = { x: e.target.x(), y: e.target.y() }
            setState((prev) => ({ ...prev, focal: next }))
          }}
          onDragEnd={() => {
            draggingRef.current = false
            setState((prev) => {
              commit(prev)
              return prev
            })
          }}
        />
      )}
    </>
  )
}
