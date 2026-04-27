import paper from 'paper'
import { ensureInit } from '@/composition/paper-bridge'

// One source-path leaf, transformed into the AssetNode's local frame
// (0, 0) → (targetWidth, targetHeight). x/y/width/height describe the
// leaf's tight bbox inside that frame; `data` is the leaf's path data
// translated so its top-left sits at (0, 0).
export type SvgPathLeaf = {
  x: number
  y: number
  width: number
  height: number
  data: string
  fill: string | null
}

// Walks an SVG document and emits one entry per drawable leaf
// (Path / CompoundPath). The caller decides whether to render each as its
// own PathNode (preserves per-element editability) or fuse them into a
// single combined path.
//
// Geometry is computed by cloning each leaf, applying T × leaf.globalMatrix
// (where T maps the imported root's bbox onto [0..targetWidth, 0..targetHeight]),
// then reading bounds + pathData. We avoid mutating the imported tree
// because importSVG produces nested groups whose applyMatrix behavior is
// inconsistent — explicit per-leaf transforms sidestep that entirely.
//
// Returns null when the SVG is unparseable or yields no usable leaves.
export function svgAssetToPaths(
  svgText: string,
  targetWidth: number,
  targetHeight: number,
): SvgPathLeaf[] | null {
  ensureInit()
  let imported: paper.Item | null = null
  try {
    imported = paper.project.importSVG(svgText, { insert: false, expandShapes: true })
  } catch {
    return null
  }
  if (!imported) return null
  try {
    const bounds = imported.bounds
    if (!bounds || bounds.width === 0 || bounds.height === 0) return null
    const T = new paper.Matrix()
    T.scale(targetWidth / bounds.width, targetHeight / bounds.height)
    T.translate(-bounds.x, -bounds.y)

    const leaves: SvgPathLeaf[] = []
    collectLeaves(imported, T, leaves)
    return leaves.length === 0 ? null : leaves
  } finally {
    imported.remove()
  }
}

function collectLeaves(item: paper.Item, T: paper.Matrix, out: SvgPathLeaf[]): void {
  if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
    const clone = item.clone({ insert: false }) as paper.PathItem
    clone.applyMatrix = true
    try {
      clone.transform(T.appended(item.globalMatrix))
      const bounds = clone.bounds
      if (!bounds || bounds.width === 0 || bounds.height === 0) return
      clone.translate(new paper.Point(-bounds.x, -bounds.y))
      const data = clone.pathData
      if (!data) return
      const source = item as paper.PathItem
      const color = source.fillColor ?? source.strokeColor
      const fill = color ? color.toCSS(true) : null
      out.push({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        data,
        fill,
      })
    } finally {
      clone.remove()
    }
    return
  }
  const children = item.children
  if (!children) return
  for (const child of children) collectLeaves(child, T, out)
}
