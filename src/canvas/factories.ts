import type {
  CanvasNode,
  EllipseNode,
  IconNode,
  LineNode,
  PolygonNode,
  RectNode,
  StarNode,
  TextNode,
} from '@/canvas/types'
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
    fill: '#f4f4f5',
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
    fill: '#e4e4e7',
    stroke: null,
    strokeWidth: 2,
  }
}

export function createLine(cx: number, cy: number): LineNode {
  return {
    ...base('Line', cx - 80, cy),
    type: 'line',
    points: [0, 0, 160, 0],
    stroke: '#0a0a0a',
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
    fill: '#0a0a0a',
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
    fill: '#f4f4f5',
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
    fill: '#f4f4f5',
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

export function createIcon(cx: number, cy: number, iconName = 'ph:star-bold', fill = '#0a0a0a'): IconNode {
  const size = 128
  return {
    ...base('Icon', cx - size / 2, cy - size / 2),
    type: 'icon',
    iconName,
    fill,
    width: size,
    height: size,
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
