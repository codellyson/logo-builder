import { PaperOffset } from 'paperjs-offset'
import type { StrokeCap, StrokeJoin } from '@/canvas/types'
import { ensureInit } from '@/composition/paper-bridge'

export type ExpandStrokeOptions = {
  width: number
  cap?: StrokeCap
  join?: StrokeJoin
  miterLimit?: number
}

type PathItem = Parameters<typeof PaperOffset.offsetStroke>[0]

// Converts a stroked path into a filled outline path covering the stroke's visible
// region. Input is the stroke's centerline (= the shape's edge for primitive shapes).
// Returns null for non-positive widths or if the offset fails.
export function expandStroke(
  path: PathItem,
  { width, cap = 'butt', join = 'miter', miterLimit = 10 }: ExpandStrokeOptions,
): PathItem | null {
  ensureInit()
  if (width <= 0) return null
  const offset = width / 2
  try {
    const outlined = PaperOffset.offsetStroke(path, offset, {
      join,
      cap,
      limit: miterLimit,
      insert: false,
    })
    if (!outlined || outlined.isEmpty()) {
      outlined?.remove()
      return null
    }
    return outlined
  } catch (err) {
    console.warn('expandStroke failed', err)
    return null
  }
}
