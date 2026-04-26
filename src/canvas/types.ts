export type NodeType = 'rect' | 'ellipse' | 'line' | 'text' | 'icon' | 'path' | 'group' | 'boolean' | 'polygon' | 'star'

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude'

export type StrokeCap = 'butt' | 'round'
export type StrokeJoin = 'miter' | 'round' | 'bevel'

// Polymorphic fill: solid color or gradient. Gradient handles live in
// node-local coords (not bbox-relative) so they extend past the shape edge for
// clean ramps and rotation works by transforming the parent group above them.
export type ColorStop = { offset: number; color: string }

export type SolidFill = { type: 'solid'; color: string }

export type LinearFill = {
  type: 'linear'
  stops: ColorStop[]
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export type RadialFill = {
  type: 'radial'
  stops: ColorStop[]
  center: { x: number; y: number }
  radius: number
  focal?: { x: number; y: number }
}

export type Fill = SolidFill | LinearFill | RadialFill

export type BooleanCache = {
  // Path data in the boolean's local frame. Rendered at (node.x, node.y) with
  // (node.rotation) — rotation pivots around the boolean's origin.
  data: string
  width: number
  height: number
  version: number
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

type NodeBase = {
  id: string
  type: NodeType
  name: string
  locked: boolean
  hidden: boolean
  x: number
  y: number
  rotation: number
  opacity: number
  blendMode?: BlendMode
  parentId?: string
}

export type RectNode = NodeBase & {
  type: 'rect'
  width: number
  height: number
  fill: Fill
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
  cornerRadius: number
}

export type EllipseNode = NodeBase & {
  type: 'ellipse'
  radiusX: number
  radiusY: number
  fill: Fill
  stroke: string | null
  strokeWidth: number
}

export type LineNode = NodeBase & {
  type: 'line'
  points: number[]
  stroke: string
  strokeWidth: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
}

export type TextNode = NodeBase & {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic'
  fill: Fill
  align: 'left' | 'center' | 'right'
  letterSpacing: number
  width: number
}

export type IconNode = NodeBase & {
  type: 'icon'
  iconName: string
  fill: Fill
  width: number
  height: number
}

export type PathNode = NodeBase & {
  type: 'path'
  data: string
  fill: Fill | null
  stroke: string | null
  strokeWidth: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
  width: number
  height: number
}

export type PolygonNode = NodeBase & {
  type: 'polygon'
  sides: number   // >= 3
  radius: number  // circumscribed radius
  fill: Fill
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}

export type StarNode = NodeBase & {
  type: 'star'
  points: number         // >= 3
  outerRadius: number
  innerRadius: number    // 0 < inner < outer
  fill: Fill
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}

export type GroupNode = NodeBase & {
  type: 'group'
  collapsed?: boolean
}

export type BooleanNode = NodeBase & {
  type: 'boolean'
  op: BooleanOp
  fill: Fill | null
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
  collapsed?: boolean
  cache: BooleanCache | null
}

export type CanvasNode =
  | RectNode
  | EllipseNode
  | LineNode
  | TextNode
  | IconNode
  | PathNode
  | PolygonNode
  | StarNode
  | GroupNode
  | BooleanNode

export type Viewport = {
  x: number
  y: number
  scale: number
}
