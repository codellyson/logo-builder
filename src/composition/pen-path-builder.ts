import paper from 'paper'
import { ensureInit } from '@/composition/paper-bridge'

// Pen tool path-building lives in its own module so canvas-store can
// dynamic-import it on penCommit instead of statically pulling paper.
// Shaped as a pure helper: in -> segments + closed flag, out -> { data,
// bounds }. Caller is responsible for translating its node origin to
// match `bounds.x / bounds.y`.

export type PenSegmentInput = {
  x: number
  y: number
  handleIn?: { dx: number; dy: number }
  handleOut?: { dx: number; dy: number }
}

export type PenPathResult = {
  data: string
  bounds: { x: number; y: number; width: number; height: number }
}

export function buildPenPathData(segs: PenSegmentInput[], closed: boolean): PenPathResult {
  ensureInit()
  const paperPath = new paper.Path({ insert: false, closed })
  for (const seg of segs) {
    paperPath.add(
      new paper.Segment(
        new paper.Point(seg.x, seg.y),
        seg.handleIn ? new paper.Point(seg.handleIn.dx, seg.handleIn.dy) : undefined,
        seg.handleOut ? new paper.Point(seg.handleOut.dx, seg.handleOut.dy) : undefined,
      ),
    )
  }
  const bounds = paperPath.bounds
  paperPath.translate(new paper.Point(-bounds.x, -bounds.y))
  const data = paperPath.pathData
  paperPath.remove()
  return {
    data,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  }
}
