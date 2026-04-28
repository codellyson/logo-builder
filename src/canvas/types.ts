export type NodeType = 'rect' | 'ellipse' | 'line' | 'text' | 'icon' | 'path' | 'group' | 'boolean' | 'polygon' | 'star' | 'asset'

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

// Visual effects applied on top of a node's geometry. Effects render in
// array order: effects[0] is innermost, effects[length-1] outermost.
// Multiple shadow-like effects can stack in SVG export, but Konva is
// single-shadow-per-shape so the canvas preview shows the topmost one.
export type DropShadowEffect = {
  type: 'drop-shadow'
  enabled: boolean
  offsetX: number
  offsetY: number
  blur: number
  color: string
  opacity: number
}

export type OuterGlowEffect = {
  type: 'outer-glow'
  enabled: boolean
  blur: number
  color: string
  opacity: number
}

export type BlurEffect = {
  type: 'blur'
  enabled: boolean
  radius: number
}

export type Effect = DropShadowEffect | OuterGlowEffect | BlurEffect

export type EffectType = Effect['type']

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
  effects?: Effect[]
}

export type RectNode = NodeBase & {
  type: 'rect'
  width: number
  height: number
  fill: Fill
  stroke: Fill | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
  cornerRadius: number
}

export type EllipseNode = NodeBase & {
  type: 'ellipse'
  radiusX: number
  radiusY: number
  fill: Fill
  stroke: Fill | null
  strokeWidth: number
}

export type LineNode = NodeBase & {
  type: 'line'
  points: number[]
  // Lines are stroke-only (no fill). Stroke is non-nullable because a line
  // with no stroke is invisible and serves no purpose.
  stroke: Fill
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
  stroke: Fill | null
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
  stroke: Fill | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}

export type StarNode = NodeBase & {
  type: 'star'
  points: number         // >= 3
  outerRadius: number
  innerRadius: number    // 0 < inner < outer
  fill: Fill
  stroke: Fill | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}

// Optional tag designating a container's role in a logo lockup. Read by
// the export-variant pipeline so `icon-only` and `wordmark-only` ZIP
// outputs land on the right shapes; falls back to a type-based heuristic
// when no roles are tagged.
export type LockupRole = 'icon' | 'wordmark'

export type GroupNode = NodeBase & {
  type: 'group'
  collapsed?: boolean
  lockupRole?: LockupRole
}

// User-uploaded image or SVG, stored in the IndexedDB `assets` table and
// referenced by id. The asset's content *is* the visual — no fill or stroke
// — but opacity / blendMode (on NodeBase) still apply. Width / height are
// node-local pixel dimensions; bakeScale multiplies them on resize.
export type AssetNode = NodeBase & {
  type: 'asset'
  assetId: string
  width: number
  height: number
}

export type BooleanNode = NodeBase & {
  type: 'boolean'
  op: BooleanOp
  fill: Fill | null
  stroke: Fill | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
  collapsed?: boolean
  lockupRole?: LockupRole
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
  | AssetNode

export type Viewport = {
  x: number
  y: number
  scale: number
}
