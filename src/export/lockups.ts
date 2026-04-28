import type { CanvasNode, LockupRole } from '@/canvas/types'
import { solidFill } from '@/composition/fills'

export type LockupVariant = 'original' | 'icon-only' | 'wordmark-only' | 'mono-dark' | 'mono-light'

// Returns true if any Group / Boolean in the project has been tagged with
// any lockup role. When at least one tag exists, variant filtering uses
// tags exclusively; when the project has zero tags, we fall back to the
// type-based heuristic so untagged projects still get sensible variants.
function hasAnyTag(nodes: CanvasNode[]): boolean {
  return nodes.some(
    (n) => (n.type === 'group' || n.type === 'boolean') && !!n.lockupRole,
  )
}

// Walks parents of `node` looking for the first ancestor with a lockupRole.
// Returns the role, or null if none of the ancestors are tagged.
function inheritedRole(node: CanvasNode, byId: Map<string, CanvasNode>): LockupRole | null {
  let current: CanvasNode | undefined = node
  while (current) {
    if (
      (current.type === 'group' || current.type === 'boolean') &&
      current.lockupRole
    ) {
      return current.lockupRole
    }
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return null
}

// Filters nodes to those belonging to the requested role's subtree. A node
// "belongs" if it OR any ancestor carries the matching tag. Children of a
// tagged container are included; siblings without a tagged ancestor are
// excluded.
function filterByRole(nodes: CanvasNode[], role: LockupRole): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.filter((n) => inheritedRole(n, byId) === role)
}

export function deriveVariant(nodes: CanvasNode[], variant: LockupVariant): CanvasNode[] {
  if (variant === 'original') return nodes
  if (variant === 'icon-only') {
    if (hasAnyTag(nodes)) return filterByRole(nodes, 'icon')
    return nodes.filter(
      (n) => n.type === 'icon' || n.type === 'path' || n.type === 'ellipse' || n.type === 'rect',
    )
  }
  if (variant === 'wordmark-only') {
    if (hasAnyTag(nodes)) return filterByRole(nodes, 'wordmark')
    return nodes.filter((n) => n.type === 'text')
  }
  if (variant === 'mono-dark') {
    return stripAssets(nodes).map((n) => recolor(n, '#0a0a0a'))
  }
  return stripAssets(nodes).map((n) => recolor(n, '#ffffff'))
}

// Mono-flattens a node:
//  - Replaces any fill / stroke (solid OR gradient) with solidFill(target).
//  - Strips the `effects` array — drop shadows / glows / blurs are
//    color-aware by definition and would survive into a mono variant
//    looking nonsensical (a black silhouette with a 50% indigo glow).
//  - Asset nodes are pixel data and can't be recolored; we keep them out
//    of mono variants entirely (callers filter them via stripAssets).
//  - Polygon / Star / Boolean / TextNode all carry fills and were missing
//    from v1's recolor — they now flatten too.
function recolor(n: CanvasNode, target: string): CanvasNode {
  const f = solidFill(target)
  const base = { ...n, effects: undefined } as CanvasNode
  if (base.type === 'rect') return { ...base, fill: f, stroke: base.stroke ? f : null }
  if (base.type === 'ellipse') return { ...base, fill: f, stroke: base.stroke ? f : null }
  if (base.type === 'line') return { ...base, stroke: f }
  if (base.type === 'text') return { ...base, fill: f }
  if (base.type === 'icon') return { ...base, fill: f }
  if (base.type === 'path') return { ...base, fill: base.fill ? f : null, stroke: base.stroke ? f : null }
  if (base.type === 'polygon') return { ...base, fill: f, stroke: base.stroke ? f : null }
  if (base.type === 'star') return { ...base, fill: f, stroke: base.stroke ? f : null }
  if (base.type === 'boolean') return { ...base, fill: base.fill ? f : null, stroke: base.stroke ? f : null }
  // group / asset: no fills to recolor; effects already stripped above.
  return base
}

// Asset nodes are raster blobs — we can't recolor pixels meaningfully for
// a mono variant. Logging the count once per export so the user knows
// they're missing from the mono SVG, without spamming per-asset.
function stripAssets(nodes: CanvasNode[]): CanvasNode[] {
  const filtered = nodes.filter((n) => n.type !== 'asset')
  const dropped = nodes.length - filtered.length
  if (dropped > 0) {
    console.warn(
      `[mono variant] dropped ${dropped} asset node${dropped === 1 ? '' : 's'} — raster pixels can't be recolored.`,
    )
  }
  return filtered
}
