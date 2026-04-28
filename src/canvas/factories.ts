import type {
  AssetNode,
  CanvasNode,
  EllipseNode,
  IconNode,
  LineNode,
  PolygonNode,
  RectNode,
  StarNode,
  TextNode,
} from '@/canvas/types'
import type { AssetRecord } from '@/persistence/db'
import { solidFill } from '@/composition/fills'
import { newId } from '@/lib/id'

const base = (name: string, x: number, y: number) => ({
  id: newId(),
  name,
  locked: false,
  hidden: false,
  x,
  y,
  rotation: 0,
  opacity: 1,
})

export function createRect(cx: number, cy: number): RectNode {
  const width = 160
  const height = 160
  return {
    ...base('Rectangle', cx - width / 2, cy - height / 2),
    type: 'rect',
    width,
    height,
    fill: solidFill('#f4f4f5'),
    stroke: null,
    strokeWidth: 2,
    cornerRadius: 0,
  }
}

export function createEllipse(cx: number, cy: number): EllipseNode {
  return {
    ...base('Ellipse', cx, cy),
    type: 'ellipse',
    radiusX: 80,
    radiusY: 80,
    fill: solidFill('#e4e4e7'),
    stroke: null,
    strokeWidth: 2,
  }
}

export function createLine(cx: number, cy: number): LineNode {
  return {
    ...base('Line', cx - 80, cy),
    type: 'line',
    points: [0, 0, 160, 0],
    stroke: solidFill('#0a0a0a'),
    strokeWidth: 4,
  }
}

export function createText(cx: number, cy: number): TextNode {
  const fontSize = 56
  const width = 320
  return {
    ...base('Text', cx - width / 2, cy - fontSize / 2),
    type: 'text',
    text: 'Brand',
    fontFamily: 'Inter',
    fontSize,
    fontStyle: 'bold',
    fill: solidFill('#0a0a0a'),
    align: 'center',
    letterSpacing: 0,
    width,
  }
}

export function createPolygon(cx: number, cy: number): PolygonNode {
  return {
    ...base('Polygon', cx, cy),
    type: 'polygon',
    sides: 5,
    radius: 80,
    fill: solidFill('#f4f4f5'),
    stroke: null,
    strokeWidth: 2,
  }
}

export function createStar(cx: number, cy: number): StarNode {
  return {
    ...base('Star', cx, cy),
    type: 'star',
    points: 5,
    outerRadius: 80,
    innerRadius: 36,
    fill: solidFill('#f4f4f5'),
    stroke: null,
    strokeWidth: 2,
  }
}

// Triangle = polygon with 3 sides. Kept as a separate factory (and toolbar button)
// because users look for "triangle" by name, not "polygon with 3 sides".
export function createTriangle(cx: number, cy: number): PolygonNode {
  return {
    ...createPolygon(cx, cy),
    name: 'Triangle',
    sides: 3,
    radius: 92, // slightly larger so the visual area matches rect/ellipse defaults
  }
}

// Places an asset node centered at (cx, cy), sized to the asset's intrinsic
// dimensions. Caps the longer dimension so a 4000×4000 import doesn't
// dominate the artboard — the user can always scale up via the
// Transformer afterward.
export function createAsset(cx: number, cy: number, asset: AssetRecord): AssetNode {
  const MAX_DIM = 320
  let width = asset.width
  let height = asset.height
  const maxDim = Math.max(width, height)
  if (maxDim > MAX_DIM) {
    const k = MAX_DIM / maxDim
    width *= k
    height *= k
  }
  return {
    ...base(asset.name || 'Asset', cx - width / 2, cy - height / 2),
    type: 'asset',
    assetId: asset.id,
    width,
    height,
  }
}

export function createIcon(cx: number, cy: number, iconName = 'ph:star-bold', fill = '#0a0a0a'): IconNode {
  const size = 128
  return {
    ...base('Icon', cx - size / 2, cy - size / 2),
    type: 'icon',
    iconName,
    fill: solidFill(fill),
    width: size,
    height: size,
  }
}

// World-space center of whatever's currently visible on the stage. Used by
// "click to add" entry points (toolbar, assets panel, etc.) so new nodes
// land at the user's focus, not at world (0, 0) or the artboard center.
// Falls back to the artboard center when the stage hasn't reported a size
// yet (mount race) so the very first click after a fresh load still works.
export function viewportInsertionCenter(
  viewport: { x: number; y: number; scale: number },
  viewportSize: { width: number; height: number },
  fallback: { stageWidth: number; stageHeight: number },
): { cx: number; cy: number } {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { cx: fallback.stageWidth / 2, cy: fallback.stageHeight / 2 }
  }
  return {
    cx: (viewportSize.width / 2 - viewport.x) / viewport.scale,
    cy: (viewportSize.height / 2 - viewport.y) / viewport.scale,
  }
}

// Toolbar-level tokens. Includes 'triangle' as a polygon preset; the actual node
// type is still 'polygon'.
export type PrimitiveType =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'icon'
  | 'polygon'
  | 'star'
  | 'triangle'

export function createByType(type: PrimitiveType, cx: number, cy: number): CanvasNode {
  switch (type) {
    case 'rect':
      return createRect(cx, cy)
    case 'ellipse':
      return createEllipse(cx, cy)
    case 'line':
      return createLine(cx, cy)
    case 'text':
      return createText(cx, cy)
    case 'icon':
      return createIcon(cx, cy)
    case 'polygon':
      return createPolygon(cx, cy)
    case 'star':
      return createStar(cx, cy)
    case 'triangle':
      return createTriangle(cx, cy)
  }
}
