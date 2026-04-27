import paper from 'paper'
import type { CanvasNode, Fill, LineNode, PathNode, StrokeCap, StrokeJoin } from '@/canvas/types'
import { ensureInit } from '@/composition/paper-bridge'
import {
  rectToPathData,
  ellipseToPathData,
  polygonToPathData,
  starToPathData,
} from '@/composition/to-path'
import { textToOutlines } from '@/composition/text-to-outlines'
import { fetchIconSvg } from '@/icons/icon-svg'
import { expandStroke, type ExpandStrokeOptions } from '@/composition/stroke-outline'
import { fillSolidColor } from '@/composition/fills'

export type NodeToPathCtx = {
  childrenOf: Map<string | undefined, CanvasNode[]>
}

export function buildCtx(nodes: CanvasNode[]): NodeToPathCtx {
  const childrenOf = new Map<string | undefined, CanvasNode[]>()
  for (const n of nodes) {
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n)
    else childrenOf.set(n.parentId, [n])
  }
  return { childrenOf }
}

export async function nodeToWorldPath(
  node: CanvasNode,
  ctx: NodeToPathCtx,
): Promise<paper.PathItem | null> {
  ensureInit()

  const local = await toLocalPath(node, ctx)
  if (!local) return null

  if (node.rotation) local.rotate(node.rotation, new paper.Point(0, 0))
  if (node.x || node.y) local.translate(new paper.Point(node.x, node.y))

  return local
}

// --- Stroke helpers ---

type StrokedLike = {
  stroke: Fill | null
  strokeWidth: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
}

function nodeStrokeOptions(
  node: CanvasNode & Partial<StrokedLike>,
): ExpandStrokeOptions | null {
  if (!node.stroke || !node.strokeWidth || node.strokeWidth <= 0) return null
  return {
    width: node.strokeWidth,
    cap: node.strokeCap ?? 'butt',
    join: node.strokeJoin ?? 'miter',
  }
}

// Consumes `fillPath` and returns the final geometry (fill + stroke outline united).
// If the node has no stroke, returns `fillPath` as-is.
function withStrokeFromFill(
  node: CanvasNode,
  fillPath: paper.PathItem,
): paper.PathItem {
  const opts = nodeStrokeOptions(node as CanvasNode & Partial<StrokedLike>)
  if (!opts) return fillPath
  const center = fillPath.clone({ insert: false }) as paper.PathItem
  const outline = expandStroke(center as paper.Path | paper.CompoundPath, opts)
  center.remove()
  if (!outline) return fillPath
  const combined = fillPath.unite(outline, { insert: false }) as paper.PathItem
  fillPath.remove()
  outline.remove()
  return combined
}

// --- Per-type builders ---

async function toLocalPath(
  node: CanvasNode,
  ctx: NodeToPathCtx,
): Promise<paper.PathItem | null> {
  if (node.type === 'rect') {
    const fill = new paper.CompoundPath({ pathData: rectToPathData(node), insert: false })
    return withStrokeFromFill(node, fill)
  }

  if (node.type === 'ellipse') {
    // ellipseToPathData produces a path centered at (0, 0); EllipseNode.x/y is the
    // center too, so the outer translate(node.x, node.y) places it correctly.
    const fill = new paper.CompoundPath({ pathData: ellipseToPathData(node), insert: false })
    return withStrokeFromFill(node, fill)
  }

  if (node.type === 'polygon') {
    // Centered at (0, 0) in local frame; outer translate places it at (node.x, node.y).
    const fill = new paper.CompoundPath({ pathData: polygonToPathData(node), insert: false })
    return withStrokeFromFill(node, fill)
  }

  if (node.type === 'star') {
    const fill = new paper.CompoundPath({ pathData: starToPathData(node), insert: false })
    return withStrokeFromFill(node, fill)
  }

  if (node.type === 'path') return localPath(node)

  if (node.type === 'line') return localLine(node)

  if (node.type === 'text') {
    const outlined = await textToOutlines(node)
    if (!outlined) return null
    return new paper.CompoundPath({ pathData: outlined.data, insert: false })
  }

  if (node.type === 'icon') {
    const svg = await fetchIconSvg(node.iconName, fillSolidColor(node.fill) ?? '#000000')
    if (!svg || !svg.startsWith('<svg')) return null
    return iconSvgToPath(svg, node.width, node.height)
  }

  if (node.type === 'group') {
    const children = ctx.childrenOf.get(node.id) ?? []
    const parts: string[] = []
    for (const c of children) {
      if (c.hidden) continue
      const p = await nodeToWorldPath(c, ctx)
      if (!p) continue
      parts.push(p.pathData)
      p.remove()
    }
    if (!parts.length) return null
    return new paper.CompoundPath({ pathData: parts.join(''), insert: false })
  }

  if (node.type === 'boolean') {
    if (!node.cache || !node.cache.data) return null
    const fill = new paper.CompoundPath({ pathData: node.cache.data, insert: false })
    return withStrokeFromFill(node, fill)
  }

  if (node.type === 'asset') {
    // Assets contribute their bbox rectangle to vector geometry — booleans
    // can't see inside a raster, and parsing the SVG asset blob synchronously
    // would block the boolean evaluator. The user can phase 4's "Convert to
    // editable" to get a real path before unioning / subtracting.
    const data = `M0 0H${node.width}V${node.height}H0Z`
    return new paper.CompoundPath({ pathData: data, insert: false })
  }

  return null
}

function localPath(node: PathNode): paper.PathItem | null {
  const centerline = new paper.CompoundPath({ pathData: node.data, insert: false })
  const strokeOpts = nodeStrokeOptions(node)

  if (node.fill) {
    const fill = centerline.clone({ insert: false }) as paper.PathItem
    if (!strokeOpts) {
      centerline.remove()
      return fill
    }
    const outline = expandStroke(centerline, strokeOpts)
    centerline.remove()
    if (!outline) return fill
    const combined = fill.unite(outline, { insert: false }) as paper.PathItem
    fill.remove()
    outline.remove()
    return combined
  }

  // No fill — only the stroke outline contributes.
  if (!strokeOpts) {
    centerline.remove()
    return null
  }
  const outline = expandStroke(centerline, strokeOpts)
  centerline.remove()
  return outline
}

function localLine(node: LineNode): paper.PathItem | null {
  const pts = node.points
  if (pts.length < 4 || node.strokeWidth <= 0) return null
  const centerline = new paper.Path({ insert: false })
  for (let i = 0; i < pts.length; i += 2) {
    centerline.add(new paper.Point(pts[i], pts[i + 1]))
  }
  const outline = expandStroke(centerline, {
    width: node.strokeWidth,
    cap: node.strokeCap ?? 'butt',
    join: node.strokeJoin ?? 'miter',
  })
  centerline.remove()
  return outline
}

function iconSvgToPath(svg: string, targetWidth: number, targetHeight: number): paper.PathItem | null {
  try {
    const imported = paper.project.importSVG(svg, { insert: false, expandShapes: true })
    if (!imported) return null
    const bounds = imported.bounds
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      imported.remove()
      return null
    }
    imported.translate(new paper.Point(-bounds.x, -bounds.y))
    imported.scale(targetWidth / bounds.width, targetHeight / bounds.height, new paper.Point(0, 0))
    const data = (imported as paper.Item & { pathData?: string }).pathData ?? ''
    imported.remove()
    if (!data) return null
    return new paper.CompoundPath({ pathData: data, insert: false })
  } catch (err) {
    console.warn('icon → path failed', err)
    return null
  }
}
