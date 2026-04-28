import paper from 'paper'
import { ensureInit } from '@/composition/paper-bridge'

export type Segment = {
  x: number
  y: number
  handleIn?: { dx: number; dy: number }
  handleOut?: { dx: number; dy: number }
  // True on the first segment of each subpath. The first array element is
  // always implicitly a subpath start; this flag marks additional internal
  // boundaries when a path has multiple subpaths (e.g. an "i" glyph
  // outline with separate dot + stem). `subpathClosed` only applies when
  // `subpathStart` is true and governs whether that subpath is closed.
  subpathStart?: boolean
  subpathClosed?: boolean
}

export function parseSegments(pathData: string): Segment[] {
  if (!pathData) return []
  ensureInit()
  try {
    // Single-subpath paths (the common case) keep using paper.Path so
    // behaviour stays bit-for-bit what it was before the multi-subpath
    // fix landed. Only when the data has multiple subpaths (e.g. an "i"
    // glyph outline) do we route through CompoundPath, which preserves
    // subpath boundaries that paper.Path would silently flatten.
    const subpathCount = (pathData.match(/[Mm]/g) ?? []).length
    const segs: Segment[] = []
    if (subpathCount <= 1) {
      const p = new paper.Path({ pathData, insert: false })
      p.segments.forEach((s, i) => {
        const seg: Segment = { x: s.point.x, y: s.point.y }
        if (!s.handleIn.isZero()) seg.handleIn = { dx: s.handleIn.x, dy: s.handleIn.y }
        if (!s.handleOut.isZero()) seg.handleOut = { dx: s.handleOut.x, dy: s.handleOut.y }
        if (i === 0) {
          seg.subpathStart = true
          seg.subpathClosed = p.closed
        }
        segs.push(seg)
      })
      p.remove()
      return segs
    }
    const compound = new paper.CompoundPath({ pathData, insert: false })
    // Duck-type the children: any object exposing a `segments` array is
    // a Path-like for our purposes. paper's `instanceof` can be flaky
    // across module boundaries because of its custom class system.
    type PathLike = { segments: paper.Segment[]; closed: boolean }
    const children = compound.children as unknown as PathLike[]
    children.forEach((child) => {
      if (!Array.isArray(child.segments)) return
      child.segments.forEach((s, i) => {
        const seg: Segment = { x: s.point.x, y: s.point.y }
        if (!s.handleIn.isZero()) seg.handleIn = { dx: s.handleIn.x, dy: s.handleIn.y }
        if (!s.handleOut.isZero()) seg.handleOut = { dx: s.handleOut.x, dy: s.handleOut.y }
        if (i === 0) {
          seg.subpathStart = true
          seg.subpathClosed = child.closed
        }
        segs.push(seg)
      })
    })
    compound.remove()
    return segs
  } catch (err) {
    console.warn('parseSegments failed', err)
    return []
  }
}

export function segmentsToPathData(segments: Segment[]): string {
  if (segments.length < 2) return ''
  ensureInit()
  try {
    type Group = { segs: Segment[]; closed: boolean }
    const groups: Group[] = []
    let current: Group | null = null
    for (const s of segments) {
      if (!current || s.subpathStart) {
        current = { segs: [s], closed: s.subpathClosed ?? false }
        groups.push(current)
      } else {
        current.segs.push(s)
      }
    }
    if (groups.length === 1) {
      const g = groups[0]
      const p = new paper.Path({ insert: false, closed: g.closed })
      for (const s of g.segs) addSegmentTo(p, s)
      const data = p.pathData
      p.remove()
      return data
    }
    const compound = new paper.CompoundPath({ insert: false })
    for (const g of groups) {
      const p = new paper.Path({ insert: false, closed: g.closed })
      for (const s of g.segs) addSegmentTo(p, s)
      compound.addChild(p)
    }
    const data = compound.pathData
    compound.remove()
    return data
  } catch (err) {
    console.warn('segmentsToPathData failed', err)
    return ''
  }
}

function addSegmentTo(path: paper.Path, s: Segment) {
  path.add(
    new paper.Segment(
      new paper.Point(s.x, s.y),
      s.handleIn ? new paper.Point(s.handleIn.dx, s.handleIn.dy) : undefined,
      s.handleOut ? new paper.Point(s.handleOut.dx, s.handleOut.dy) : undefined,
    ),
  )
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
  const segs = parseSegments(pathData)
  if (segs.length < 2) return null
  const idxSet = new Set(indices)
  const next = segs.map((s, i) => (idxSet.has(i) ? applyStyle(s, i, segs, style) : s))
  return segmentsToPathData(next)
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
  const segs = parseSegments(pathData)
  const idxSet = new Set(indices)
  const next = segs.map((s, i) => (idxSet.has(i) ? { ...s, x: s.x + dx, y: s.y + dy } : s))
  return segmentsToPathData(next)
}

// Returns new pathData with the segments at the given indices removed. Returns
// null if the deletion would leave fewer than 2 segments. If a removed segment
// was the start of a subpath, the subpath flags are transferred to the next
// surviving segment in that subpath so its boundary survives the round trip.
export function deleteSegments(pathData: string, indicesToRemove: number[]): string | null {
  const segs = parseSegments(pathData)
  const rm = new Set(indicesToRemove)
  const kept: Segment[] = []
  let pending: { closed: boolean } | null = null
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.subpathStart) {
      if (rm.has(i)) {
        pending = { closed: s.subpathClosed ?? false }
        continue
      }
      kept.push(s)
      pending = null
      continue
    }
    if (rm.has(i)) continue
    if (pending) {
      kept.push({ ...s, subpathStart: true, subpathClosed: pending.closed })
      pending = null
      continue
    }
    kept.push(s)
  }
  if (kept.length < 2) return null
  return segmentsToPathData(kept)
}

// Splits a multi-subpath path's data into one entry per subpath, each with
// its own pathData and bbox in the original's local coordinate space.
// Returns an empty array if the input only has one subpath. Used by the
// "Break apart" toolbar action so users can style or move dot/stem-style
// glyph pieces independently after Text → Outlines.
export type SplitSubpath = {
  data: string
  bbox: { x: number; y: number; width: number; height: number }
}

export function splitSubpaths(pathData: string): SplitSubpath[] {
  if (!pathData) return []
  const subpathCount = (pathData.match(/[Mm]/g) ?? []).length
  if (subpathCount <= 1) return []
  ensureInit()
  try {
    const compound = new paper.CompoundPath({ pathData, insert: false })
    type PathLike = { segments: paper.Segment[]; pathData: string; bounds: paper.Rectangle }
    const result: SplitSubpath[] = []
    const children = compound.children as unknown as PathLike[]
    for (const child of children) {
      if (!Array.isArray(child.segments) || child.segments.length === 0) continue
      const b = child.bounds
      result.push({
        data: child.pathData,
        bbox: { x: b.x, y: b.y, width: b.width, height: b.height },
      })
    }
    compound.remove()
    return result
  } catch (err) {
    console.warn('splitSubpaths failed', err)
    return []
  }
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
    const compound = new paper.CompoundPath({ pathData, insert: false })
    const point = new paper.Point(localX, localY)
    let bestPath: paper.Path | null = null
    let bestLoc: paper.CurveLocation | null = null
    let bestDist = Infinity
    let bestOffset = 0
    let runningOffset = 0
    for (const child of compound.children) {
      if (!(child instanceof paper.Path)) continue
      const loc = child.getNearestLocation(point)
      if (loc) {
        const dist = loc.point.getDistance(point)
        if (dist < bestDist) {
          bestDist = dist
          bestLoc = loc
          bestPath = child
          bestOffset = runningOffset
        }
      }
      runningOffset += child.segments.length
    }
    if (!bestPath || !bestLoc || bestDist > toleranceLocal) {
      compound.remove()
      return null
    }
    const divided = bestPath.divideAt(bestLoc)
    if (!divided) {
      compound.remove()
      return null
    }
    const insertedIndex = bestOffset + divided.index
    const data = compound.pathData
    compound.remove()
    return { data, insertedIndex }
  } catch {
    return null
  }
}
