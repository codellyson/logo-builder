import { Circle, Line, Path } from 'react-konva'
import type { PenDraftSegment, PenDraftState } from '@/state/canvas-store'

type Props = {
  draft: NonNullable<PenDraftState>
  scale: number
}

const HANDLE_COLOR = '#818cf8'
const FIRST_ANCHOR_COLOR = '#6366f1'
const HANDLE_FILL = '#0a0a0a'

export function PenDraftPreview({ draft, scale }: Props) {
  const segs = draft.segments
  const pending = draft.pending
  const allSegs = pending ? [...segs, pending] : segs
  if (allSegs.length === 0) return null

  const anchorRadius = 4 / scale
  const strokeWidth = 1 / scale
  const handleDotRadius = 3 / scale

  const pathData = buildPathData(allSegs)
  const rubberBandData = buildRubberBand(allSegs, draft.cursor)

  return (
    <>
      {allSegs.length >= 2 && pathData && (
        <Path data={pathData} stroke={HANDLE_COLOR} strokeWidth={strokeWidth} listening={false} />
      )}
      {rubberBandData && (
        <Path
          data={rubberBandData}
          stroke={HANDLE_COLOR}
          strokeWidth={strokeWidth}
          dash={[4 / scale, 3 / scale]}
          listening={false}
        />
      )}
      {/* Handle lollipops on finalized + pending segments */}
      {allSegs.map((s, i) => (
        <HandleLollipops
          key={`hl-${i}`}
          seg={s}
          strokeWidth={strokeWidth}
          dotRadius={handleDotRadius}
        />
      ))}
      {allSegs.map((s, i) => (
        <Circle
          key={`a-${i}`}
          name={i === 0 ? 'pen-first-anchor' : 'pen-anchor'}
          x={s.x}
          y={s.y}
          radius={anchorRadius}
          fill={HANDLE_FILL}
          stroke={i === 0 ? FIRST_ANCHOR_COLOR : HANDLE_COLOR}
          strokeWidth={strokeWidth * 1.5}
        />
      ))}
    </>
  )
}

function HandleLollipops({
  seg,
  strokeWidth,
  dotRadius,
}: {
  seg: PenDraftSegment
  strokeWidth: number
  dotRadius: number
}) {
  return (
    <>
      {seg.handleIn && (
        <>
          <Line
            points={[seg.x, seg.y, seg.x + seg.handleIn.dx, seg.y + seg.handleIn.dy]}
            stroke={HANDLE_COLOR}
            strokeWidth={strokeWidth}
            listening={false}
          />
          <Circle
            x={seg.x + seg.handleIn.dx}
            y={seg.y + seg.handleIn.dy}
            radius={dotRadius}
            fill={HANDLE_COLOR}
            listening={false}
          />
        </>
      )}
      {seg.handleOut && (
        <>
          <Line
            points={[seg.x, seg.y, seg.x + seg.handleOut.dx, seg.y + seg.handleOut.dy]}
            stroke={HANDLE_COLOR}
            strokeWidth={strokeWidth}
            listening={false}
          />
          <Circle
            x={seg.x + seg.handleOut.dx}
            y={seg.y + seg.handleOut.dy}
            radius={dotRadius}
            fill={HANDLE_COLOR}
            listening={false}
          />
        </>
      )}
    </>
  )
}

// SVG path d-string for the sequence of anchors with cubic beziers where handles exist.
function buildPathData(segs: PenDraftSegment[]): string | null {
  if (segs.length < 2) return null
  let d = `M${segs[0].x} ${segs[0].y}`
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1]
    const curr = segs[i]
    if (prev.handleOut || curr.handleIn) {
      const c1x = prev.x + (prev.handleOut?.dx ?? 0)
      const c1y = prev.y + (prev.handleOut?.dy ?? 0)
      const c2x = curr.x + (curr.handleIn?.dx ?? 0)
      const c2y = curr.y + (curr.handleIn?.dy ?? 0)
      d += `C${c1x} ${c1y} ${c2x} ${c2y} ${curr.x} ${curr.y}`
    } else {
      d += `L${curr.x} ${curr.y}`
    }
  }
  return d
}

// Dashed preview from the last anchor to the current cursor, honoring the last
// anchor's handleOut so users see the curve that would be placed next.
function buildRubberBand(
  segs: PenDraftSegment[],
  cursor: { x: number; y: number } | null,
): string | null {
  if (!cursor || segs.length === 0) return null
  const last = segs[segs.length - 1]
  if (last.handleOut) {
    const c1x = last.x + last.handleOut.dx
    const c1y = last.y + last.handleOut.dy
    // No handleIn on the cursor target — use the cursor as its own control point.
    return `M${last.x} ${last.y}C${c1x} ${c1y} ${cursor.x} ${cursor.y} ${cursor.x} ${cursor.y}`
  }
  return `M${last.x} ${last.y}L${cursor.x} ${cursor.y}`
}
