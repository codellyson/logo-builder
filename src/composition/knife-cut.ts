import paper from 'paper'
import { ensureInit } from '@/composition/paper-bridge'
import { newId } from '@/lib/id'
import { convertToPath } from '@/composition/convert-to-path'
import type { CanvasNode, PathNode } from '@/canvas/types'

// Knife line in world coords. Same frame as a top-level node's (x, y).
export type KnifeLine = {
  startX: number
  startY: number
  endX: number
  endY: number
}

// One node became zero or more nodes. Empty `replace` means the node is
// removed entirely (a degenerate cut wiped its geometry); the typical
// result is `[a, b]` for a clean two-piece cut.
export type KnifeReplacement = {
  removeId: string
  replace: PathNode[]
}

// Walks the canvas and applies the knife to every leaf vector node. Groups
// are recursed into; locked / hidden / boolean / text / image / icon nodes
// are skipped. Returns the planned mutations — caller commits to the store.
export function planKnifeCut(nodes: CanvasNode[], line: KnifeLine): KnifeReplacement[] {
  ensureInit()
  const dx = line.endX - line.startX
  const dy = line.endY - line.startY
  if (Math.hypot(dx, dy) < 1) return []

  const replacements: KnifeReplacement[] = []
  for (const n of nodes) {
    if (n.locked || n.hidden) continue
    // Only top-level vector leaves. A node inside a group has its (x, y) in
    // group-local coords, so the knife (in world) would compute crossings
    // against the wrong frame. Workflow for grouped objects: ungroup, cut,
    // regroup.
    if (n.parentId) continue
    if (n.type !== 'path' && n.type !== 'rect' && n.type !== 'ellipse' && n.type !== 'line')
      continue

    // Get a PathNode equivalent — for primitives, convertToPath produces one
    // with its own (x, y) origin. We never commit this; it's a working copy
    // for the cut math. Real replacement nodes are built off `pathBase`.
    const pathBase = n.type === 'path' ? n : convertToPath(n)
    if (!pathBase || pathBase.type !== 'path') continue

    const pieces = cutPath(pathBase, line)
    if (!pieces) continue

    const replace: PathNode[] = pieces.map((p, i) => ({
      ...pathBase,
      id: newId(),
      name: `${pathBase.name} ${i + 1}`,
      // pathBounds-derived size keeps the bbox honest for transformer/anchors.
      ...p,
    }))
    replacements.push({ removeId: n.id, replace })
  }
  return replacements
}

type Piece = { data: string; x: number; y: number; width: number; height: number }

// Splits a single PathNode along the knife line. Returns null when the line
// misses the node or the cut degenerates (no usable pieces). `pathBase` is in
// world coords; we transform the knife into the node's local frame, run the
// subtract, then walk the resulting subpaths back out.
function cutPath(pathBase: PathNode, line: KnifeLine): Piece[] | null {
  // Knife endpoints in node-local coords. Handle node rotation.
  const a = worldToLocal(line.startX, line.startY, pathBase)
  const b = worldToLocal(line.endX, line.endY, pathBase)

  let compound: paper.CompoundPath | null = null
  let blade: paper.Path | null = null
  try {
    compound = new paper.CompoundPath({ pathData: pathBase.data, insert: false })
    const knife = new paper.Path({
      segments: [new paper.Point(a.x, a.y), new paper.Point(b.x, b.y)],
      insert: false,
    })
    const crossings = compound.getCrossings(knife)
    knife.remove()
    if (crossings.length === 0) {
      compound.remove()
      return null
    }
    blade = bladeAlongLine(a, b, pathBase)
    const result = compound.subtract(blade, { insert: false }) as paper.PathItem
    const pieces = walkPieces(result, pathBase)
    result.remove()
    return pieces.length >= 1 ? pieces : null
  } catch (err) {
    console.warn('knife cut failed', err)
    return null
  } finally {
    compound?.remove()
    blade?.remove()
  }
}

// Builds a thin rectangular "blade" along the knife line, slightly extended
// past both endpoints so a crossing right at the edge still produces a
// clean exit. Thickness is tuned to be small relative to the node's bbox —
// large enough to dodge floating-point fuzz, small enough that the visible
// material removed reads as a hairline.
function bladeAlongLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
  pathBase: PathNode,
): paper.Path {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const diag = Math.hypot(pathBase.width, pathBase.height) || 100
  const thickness = Math.max(0.1, diag * 0.0005)
  const extend = diag
  const sx = a.x - ux * extend
  const sy = a.y - uy * extend
  const ex = b.x + ux * extend
  const ey = b.y + uy * extend
  return new paper.Path({
    segments: [
      new paper.Point(sx + px * thickness, sy + py * thickness),
      new paper.Point(ex + px * thickness, ey + py * thickness),
      new paper.Point(ex - px * thickness, ey - py * thickness),
      new paper.Point(sx - px * thickness, sy - py * thickness),
    ],
    closed: true,
    insert: false,
  })
}

// After the boolean subtract, the result is either a single Path (one piece
// remaining) or a CompoundPath (multiple disconnected regions). Each child
// becomes its own piece; we re-anchor the piece's pathData around its own
// bbox so the new PathNode lands at the right (x, y) and reports an honest
// width/height for the transformer.
function walkPieces(result: paper.PathItem, pathBase: PathNode): Piece[] {
  const out: Piece[] = []
  const children: paper.PathItem[] =
    result instanceof paper.CompoundPath
      ? (result.children as unknown as paper.PathItem[])
      : [result]
  for (const child of children) {
    if (!('segments' in child)) continue
    const segs = (child as unknown as { segments: paper.Segment[] }).segments
    if (!segs || segs.length < 2) continue
    const b = child.bounds
    if (b.width === 0 || b.height === 0) continue
    // Translate the piece to its own origin so the child's pathData is
    // expressed relative to (0, 0). This mirrors how breakApart and
    // convertToPath emit PathNodes.
    const shifted = child.clone({ insert: false }) as paper.PathItem
    shifted.translate(new paper.Point(-b.x, -b.y))
    const data = shifted.pathData
    shifted.remove()
    out.push({
      data,
      x: pathBase.x + b.x,
      y: pathBase.y + b.y,
      width: b.width,
      height: b.height,
    })
  }
  return out
}

function worldToLocal(
  wx: number,
  wy: number,
  node: { x: number; y: number; rotation: number },
): { x: number; y: number } {
  const dx = wx - node.x
  const dy = wy - node.y
  if (!node.rotation) return { x: dx, y: dy }
  const rad = (-node.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}
