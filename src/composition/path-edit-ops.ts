import paper from 'paper'
import { ensureInit } from '@/composition/paper-bridge'

export type Segment = {
  x: number
  y: number
  handleIn?: { dx: number; dy: number }
  handleOut?: { dx: number; dy: number }
}

export function parseSegments(pathData: string): Segment[] {
  if (!pathData) return []
  ensureInit()
  try {
    const p = new paper.Path({ pathData, insert: false })
    const segs: Segment[] = p.segments.map((s) => {
      const seg: Segment = { x: s.point.x, y: s.point.y }
      if (!s.handleIn.isZero()) seg.handleIn = { dx: s.handleIn.x, dy: s.handleIn.y }
      if (!s.handleOut.isZero()) seg.handleOut = { dx: s.handleOut.x, dy: s.handleOut.y }
      return seg
    })
    p.remove()
    return segs
  } catch {
    return []
  }
}

export function isClosedPath(pathData: string): boolean {
  if (!pathData) return false
  ensureInit()
  try {
    const p = new paper.Path({ pathData, insert: false })
    const c = p.closed
    p.remove()
    return c
  } catch {
    return false
  }
}

export function segmentsToPathData(segments: Segment[], closed: boolean): string {
  if (segments.length < 2) return ''
  ensureInit()
  try {
    const p = new paper.Path({ insert: false, closed })
    for (const s of segments) {
      p.add(
        new paper.Segment(
          new paper.Point(s.x, s.y),
          s.handleIn ? new paper.Point(s.handleIn.dx, s.handleIn.dy) : undefined,
          s.handleOut ? new paper.Point(s.handleOut.dx, s.handleOut.dy) : undefined,
        ),
      )
    }
    const data = p.pathData
    p.remove()
    return data
  } catch {
    return ''
  }
}

export type SegmentStyle = 'corner' | 'smooth' | 'cusp'

const MIRROR_EPSILON = 0.001

export function getSegmentStyle(seg: Segment): SegmentStyle {
  if (!seg.handleIn && !seg.handleOut) return 'corner'
  if (seg.handleIn && seg.handleOut) {
    const mirror =
      Math.abs(seg.handleIn.dx + seg.handleOut.dx) < MIRROR_EPSILON &&
      Math.abs(seg.handleIn.dy + seg.handleOut.dy) < MIRROR_EPSILON
    return mirror ? 'smooth' : 'cusp'
  }
  return 'cusp'
}

// Applies the style to segments at the given indices and returns new pathData.
// Semantics:
//   corner → clear both handles
//   smooth → mirror handles around the anchor (symmetric vectors); infers
//            direction from existing handle(s) or from prev/next neighbors
//   cusp   → break symmetry (if already smooth, rotate one handle 45°;
//            if missing handles, add asymmetric defaults)
export function setSegmentStyles(
  pathData: string,
  indices: number[],
  style: SegmentStyle,
): string | null {
  if (!pathData || indices.length === 0) return null
  const closed = isClosedPath(pathData)
  const segs = parseSegments(pathData)
  if (segs.length < 2) return null
  const idxSet = new Set(indices)
  const next = segs.map((s, i) => (idxSet.has(i) ? applyStyle(s, i, segs, style) : s))
  return segmentsToPathData(next, closed)
}

function applyStyle(seg: Segment, index: number, all: Segment[], style: SegmentStyle): Segment {
  if (style === 'corner') {
    const { x, y } = seg
    return { x, y }
  }
  if (style === 'smooth') {
    const vec = inferSmoothVector(seg, index, all)
    return { x: seg.x, y: seg.y, handleOut: vec, handleIn: { dx: -vec.dx, dy: -vec.dy } }
  }
  // cusp
  if (seg.handleIn && seg.handleOut) {
    const mirror =
      Math.abs(seg.handleIn.dx + seg.handleOut.dx) < MIRROR_EPSILON &&
      Math.abs(seg.handleIn.dy + seg.handleOut.dy) < MIRROR_EPSILON
    if (!mirror) return seg
    const a = Math.PI / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    return {
      ...seg,
      handleIn: {
        dx: seg.handleIn.dx * c - seg.handleIn.dy * s,
        dy: seg.handleIn.dx * s + seg.handleIn.dy * c,
      },
    }
  }
  if (seg.handleOut && !seg.handleIn) {
    return { ...seg, handleIn: { dx: -seg.handleOut.dy, dy: seg.handleOut.dx } }
  }
  if (seg.handleIn && !seg.handleOut) {
    return { ...seg, handleOut: { dx: -seg.handleIn.dy, dy: seg.handleIn.dx } }
  }
  // no handles yet — derive two asymmetric ones from neighbor tangent
  const tangent = neighborTangent(index, all)
  return {
    ...seg,
    handleOut: tangent,
    handleIn: { dx: -tangent.dy, dy: tangent.dx },
  }
}

function inferSmoothVector(
  seg: Segment,
  index: number,
  all: Segment[],
): { dx: number; dy: number } {
  if (seg.handleOut) return seg.handleOut
  if (seg.handleIn) return { dx: -seg.handleIn.dx, dy: -seg.handleIn.dy }
  return neighborTangent(index, all)
}

function neighborTangent(index: number, all: Segment[]): { dx: number; dy: number } {
  const prev = all[(index - 1 + all.length) % all.length]
  const next = all[(index + 1) % all.length]
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const mag = Math.hypot(dx, dy)
  if (mag === 0) return { dx: 0, dy: 0 }
  // Modest default — 1/6 of prev→next distance, capped at 60px so corners on
  // big shapes don't get wildly long handles. User can drag to taste.
  const len = Math.min(mag / 6, 60)
  return { dx: (dx / mag) * len, dy: (dy / mag) * len }
}

// Translates the anchor points of the given indices by (dx, dy) in local frame.
// Handles stay relative to their anchor, so the curve shape around moved anchors
// is preserved.
export function nudgeSegments(
  pathData: string,
  indices: number[],
  dx: number,
  dy: number,
): string | null {
  if (!pathData || indices.length === 0) return null
  const closed = isClosedPath(pathData)
  const segs = parseSegments(pathData)
  const idxSet = new Set(indices)
  const next = segs.map((s, i) => (idxSet.has(i) ? { ...s, x: s.x + dx, y: s.y + dy } : s))
  return segmentsToPathData(next, closed)
}

// Returns new pathData with the segments at the given indices removed. Returns
// null if the deletion would leave fewer than 2 segments.
export function deleteSegments(pathData: string, indicesToRemove: number[]): string | null {
  const closed = isClosedPath(pathData)
  const segs = parseSegments(pathData)
  const rm = new Set(indicesToRemove)
  const kept = segs.filter((_, i) => !rm.has(i))
  if (kept.length < 2) return null
  return segmentsToPathData(kept, closed)
}

// Inserts a new segment at the nearest point on the path to (localX, localY).
// Uses paper's divideAt so curvature is preserved (the new segment carries
// handles consistent with the existing curve). Returns null if the click is
// farther than `toleranceLocal` from the path.
export function insertSegmentAt(
  pathData: string,
  localX: number,
  localY: number,
  toleranceLocal: number,
): { data: string; insertedIndex: number } | null {
  if (!pathData) return null
  ensureInit()
  try {
    const p = new paper.Path({ pathData, insert: false })
    const point = new paper.Point(localX, localY)
    const loc = p.getNearestLocation(point)
    if (!loc) {
      p.remove()
      return null
    }
    if (loc.point.getDistance(point) > toleranceLocal) {
      p.remove()
      return null
    }
    const divided = p.divideAt(loc)
    if (!divided) {
      p.remove()
      return null
    }
    const insertedIndex = divided.index
    const data = p.pathData
    p.remove()
    return { data, insertedIndex }
  } catch {
    return null
  }
}
