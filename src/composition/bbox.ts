import type { CanvasNode } from '@/canvas/types'
import type { Bbox } from '@/composition/alignment'
import { polygonPoints, starPoints } from '@/composition/to-path'

// Axis-aligned bbox in world coords. Handles rotation by rotating the shape's
// local bbox corners around the node's pivot and taking min/max.
//
// Pivot convention: matches Konva's per-shape origin — top-left for rect/text/
// icon/path, center for ellipse, absolute point for line, cache origin for
// boolean. Group returns null (compute via union of children externally).
export function getNodeBbox(node: CanvasNode): Bbox | null {
  switch (node.type) {
    case 'rect':
      return boxWithRotation(node.x, node.y, 0, 0, node.width, node.height, node.rotation)
    case 'ellipse':
      return boxWithRotation(
        node.x,
        node.y,
        -node.radiusX,
        -node.radiusY,
        node.radiusX * 2,
        node.radiusY * 2,
        node.rotation,
      )
    case 'line': {
      const pts = node.points
      if (pts.length < 2) return null
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        xs.push(pts[i])
        ys.push(pts[i + 1])
      }
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const pad = node.strokeWidth / 2
      return boxWithRotation(
        node.x,
        node.y,
        minX - pad,
        minY - pad,
        maxX - minX + pad * 2,
        maxY - minY + pad * 2,
        node.rotation,
      )
    }
    case 'text':
      return boxWithRotation(node.x, node.y, 0, 0, node.width, node.fontSize * 1.2, node.rotation)
    case 'icon':
      return boxWithRotation(node.x, node.y, 0, 0, node.width, node.height, node.rotation)
    case 'path':
      return boxWithRotation(node.x, node.y, 0, 0, node.width, node.height, node.rotation)
    case 'polygon': {
      const pts = polygonPoints(node.sides, node.radius)
      return vertexBbox(node.x, node.y, pts, node.rotation)
    }
    case 'star': {
      const pts = starPoints(node.points, node.outerRadius, node.innerRadius)
      return vertexBbox(node.x, node.y, pts, node.rotation)
    }
    case 'boolean': {
      if (!node.cache || node.cache.width === 0 || node.cache.height === 0) return null
      return boxWithRotation(
        node.x,
        node.y,
        0,
        0,
        node.cache.width,
        node.cache.height,
        node.rotation,
      )
    }
    case 'group':
      return null
  }
}

// Computes the union bbox of multiple nodes. Groups are expanded into their
// children here via `childrenOf`.
export function getSelectionBbox(
  nodes: CanvasNode[],
  selectedIds: string[],
  childrenOf: Map<string | undefined, CanvasNode[]>,
): Bbox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const queue: CanvasNode[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const id of selectedIds) {
    const n = byId.get(id)
    if (n) queue.push(n)
  }
  while (queue.length) {
    const n = queue.shift()!
    if (n.type === 'group') {
      const kids = childrenOf.get(n.id) ?? []
      for (const k of kids) queue.push(k)
      continue
    }
    const b = getNodeBbox(n)
    if (!b) continue
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  if (!isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// Bbox in the node's *local* frame (origin = node.x, node.y; rotation
// excluded). Used to seed gradient endpoints — gradients are stored in this
// same frame so a default like `start=(0,0) end=(width,0)` makes geometric
// sense per shape type.
export function getNodeLocalBbox(node: CanvasNode): Bbox | null {
  switch (node.type) {
    case 'rect':
      return { x: 0, y: 0, width: node.width, height: node.height }
    case 'ellipse':
      return {
        x: -node.radiusX,
        y: -node.radiusY,
        width: node.radiusX * 2,
        height: node.radiusY * 2,
      }
    case 'text':
      return { x: 0, y: 0, width: node.width, height: node.fontSize * 1.2 }
    case 'icon':
      return { x: 0, y: 0, width: node.width, height: node.height }
    case 'path':
      return { x: 0, y: 0, width: node.width, height: node.height }
    case 'polygon':
      return {
        x: -node.radius,
        y: -node.radius,
        width: node.radius * 2,
        height: node.radius * 2,
      }
    case 'star':
      return {
        x: -node.outerRadius,
        y: -node.outerRadius,
        width: node.outerRadius * 2,
        height: node.outerRadius * 2,
      }
    case 'boolean': {
      if (!node.cache || node.cache.width === 0 || node.cache.height === 0) return null
      return { x: 0, y: 0, width: node.cache.width, height: node.cache.height }
    }
    case 'line':
    case 'group':
      return null
  }
}

function vertexBbox(pivotX: number, pivotY: number, pts: number[], rotation: number): Bbox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i]
    if (pts[i] > maxX) maxX = pts[i]
    if (pts[i + 1] < minY) minY = pts[i + 1]
    if (pts[i + 1] > maxY) maxY = pts[i + 1]
  }
  return boxWithRotation(pivotX, pivotY, minX, minY, maxX - minX, maxY - minY, rotation)
}

function boxWithRotation(
  pivotX: number,
  pivotY: number,
  localLeft: number,
  localTop: number,
  w: number,
  h: number,
  rotation: number,
): Bbox {
  if (rotation === 0) {
    return { x: pivotX + localLeft, y: pivotY + localTop, width: w, height: h }
  }
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const corners: [number, number][] = [
    [localLeft, localTop],
    [localLeft + w, localTop],
    [localLeft + w, localTop + h],
    [localLeft, localTop + h],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [dx, dy] of corners) {
    const x = pivotX + dx * cos - dy * sin
    const y = pivotY + dx * sin + dy * cos
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
