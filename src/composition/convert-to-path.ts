import type { CanvasNode, PathNode } from '@/canvas/types'
import { pathBounds, translatePath } from '@/composition/paper-bridge'
import { ellipseToPathData, lineToPathData, rectToPathData } from '@/composition/to-path'
import { newId } from '@/lib/id'

// convertToPath uses pathBounds / translatePath (paper.js). Keeping it
// in its own module so to-path.ts can stay paper-free — to-path is
// imported by canvas/nodes for shape rendering, which would otherwise
// drag paper into the eager bundle.
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
