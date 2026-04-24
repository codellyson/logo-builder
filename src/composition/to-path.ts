import type { CanvasNode, EllipseNode, LineNode, PathNode, RectNode } from '@/canvas/types'
import { pathBounds, translatePath } from '@/composition/paper-bridge'
import { newId } from '@/lib/id'

export function rectToPathData(n: RectNode): string {
  const r = Math.max(0, Math.min(n.cornerRadius, n.width / 2, n.height / 2))
  if (r === 0) return `M0 0H${n.width}V${n.height}H0Z`
  return `M${r} 0H${n.width - r}A${r} ${r} 0 0 1 ${n.width} ${r}V${n.height - r}A${r} ${r} 0 0 1 ${n.width - r} ${n.height}H${r}A${r} ${r} 0 0 1 0 ${n.height - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
}

export function ellipseToPathData(n: EllipseNode): string {
  const rx = n.radiusX
  const ry = n.radiusY
  return `M${-rx} 0A${rx} ${ry} 0 1 0 ${rx} 0A${rx} ${ry} 0 1 0 ${-rx} 0Z`
}

export function lineToPathData(n: LineNode): string {
  const pts = n.points
  if (pts.length < 4) return ''
  let d = `M${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
  return d
}

export function convertToPath(node: CanvasNode): PathNode | null {
  const baseOut = {
    id: newId(),
    type: 'path' as const,
    name: `${node.name} (path)`,
    locked: false,
    hidden: false,
    rotation: node.rotation,
    opacity: node.opacity,
  }

  if (node.type === 'rect') {
    return {
      ...baseOut,
      x: node.x,
      y: node.y,
      data: rectToPathData(node),
      fill: node.fill,
      stroke: node.stroke,
      strokeWidth: node.strokeWidth,
      width: node.width,
      height: node.height,
    }
  }
  if (node.type === 'ellipse') {
    const data = translatePath(ellipseToPathData(node), node.radiusX, node.radiusY)
    return {
      ...baseOut,
      x: node.x - node.radiusX,
      y: node.y - node.radiusY,
      data,
      fill: node.fill,
      stroke: node.stroke,
      strokeWidth: node.strokeWidth,
      width: node.radiusX * 2,
      height: node.radiusY * 2,
    }
  }
  if (node.type === 'line') {
    const data = lineToPathData(node)
    const b = pathBounds(data)
    return {
      ...baseOut,
      x: node.x,
      y: node.y,
      data,
      fill: null,
      stroke: node.stroke,
      strokeWidth: node.strokeWidth,
      width: b.width,
      height: b.height,
    }
  }
  if (node.type === 'path') return node
  return null
}
