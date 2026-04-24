import paper from 'paper'
import type { CanvasNode } from '@/canvas/types'
import { ensureInit } from '@/composition/paper-bridge'
import { rectToPathData, ellipseToPathData } from '@/composition/to-path'
import { textToOutlines } from '@/composition/text-to-outlines'
import { fetchIconSvg } from '@/icons/icon-svg'

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

async function toLocalPath(
  node: CanvasNode,
  ctx: NodeToPathCtx,
): Promise<paper.PathItem | null> {
  if (node.type === 'rect') {
    return new paper.CompoundPath({ pathData: rectToPathData(node), insert: false })
  }

  if (node.type === 'ellipse') {
    // ellipseToPathData produces a path centered at (0, 0). EllipseNode.x/y is the
    // center too, so the outer translate(node.x, node.y) places it correctly.
    return new paper.CompoundPath({ pathData: ellipseToPathData(node), insert: false })
  }

  if (node.type === 'path') {
    return new paper.CompoundPath({ pathData: node.data, insert: false })
  }

  if (node.type === 'text') {
    const outlined = await textToOutlines(node)
    if (!outlined) return null
    return new paper.CompoundPath({ pathData: outlined.data, insert: false })
  }

  if (node.type === 'icon') {
    const svg = await fetchIconSvg(node.iconName, node.fill)
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
    // Nested boolean: use its cached result. If cache is missing, the runner will
    // re-evaluate this parent once the inner cache lands (see setBooleanCache
    // ancestor invalidation in the store).
    if (!node.cache || !node.cache.data) return null
    return new paper.CompoundPath({ pathData: node.cache.data, insert: false })
  }

  // 'line' and any future open-path types are rejected — boolean ops need closed regions
  return null
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
