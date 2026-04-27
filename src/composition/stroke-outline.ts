import paper from 'paper'
import { PaperOffset } from 'paperjs-offset'
import type { CanvasNode, StrokeCap, StrokeJoin } from '@/canvas/types'
import { ensureInit } from '@/composition/paper-bridge'
import {
  ellipseToPathData,
  polygonToPathData,
  rectToPathData,
  starToPathData,
} from '@/composition/to-path'

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

// Returns the SVG path data for the stroke outline of a node, in node-local
// coords. Used by the canvas renderer to fall back when Konva can't render
// a stroke style natively — specifically radial gradients (Konva 10.2.5
// implements only `strokeLinearGradient*`, no radial counterpart). The
// outline is then drawn as a Konva.Path filled with the radial gradient.
export function computeStrokeOutlinePathData(node: CanvasNode): string | null {
  if (!('stroke' in node) || !node.stroke) return null
  if (!('strokeWidth' in node) || node.strokeWidth <= 0) return null

  const cap: StrokeCap = ('strokeCap' in node ? node.strokeCap : undefined) ?? 'butt'
  const join: StrokeJoin = ('strokeJoin' in node ? node.strokeJoin : undefined) ?? 'miter'
  const opts = { width: node.strokeWidth, cap, join }

  let centerlineData: string | null = null
  if (node.type === 'rect') centerlineData = rectToPathData(node)
  else if (node.type === 'ellipse') centerlineData = ellipseToPathData(node)
  else if (node.type === 'polygon') centerlineData = polygonToPathData(node)
  else if (node.type === 'star') centerlineData = starToPathData(node)
  else if (node.type === 'path') centerlineData = node.data
  else if (node.type === 'boolean') centerlineData = node.cache?.data ?? null
  else if (node.type === 'line') {
    const pts = node.points
    if (pts.length < 4) return null
    let d = `M${pts[0]} ${pts[1]}`
    for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
    centerlineData = d
  }
  if (!centerlineData) return null

  ensureInit()
  try {
    const p = new paper.CompoundPath({ pathData: centerlineData, insert: false })
    const outline = expandStroke(p, opts)
    p.remove()
    if (!outline) return null
    const data = outline.pathData
    outline.remove()
    return data
  } catch (err) {
    console.warn('computeStrokeOutlinePathData failed', err)
    return null
  }
}
