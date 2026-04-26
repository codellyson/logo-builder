import type { ColorStop, Fill, LinearFill, RadialFill, SolidFill } from '@/canvas/types'

export function solidFill(color: string): SolidFill {
  return { type: 'solid', color }
}

// Returns a representative hex color for any fill: the solid color, or the
// first stop of a gradient. Used by the ColorPicker (which is hex-based) to
// show *something* when a gradient is set, by the icon recolor path which
// can't render gradients yet, and by the layer-thumbnail fallback.
export function fillSolidColor(fill: Fill | null | undefined): string | null {
  if (!fill) return null
  if (fill.type === 'solid') return fill.color
  return fill.stops[0]?.color ?? null
}

// Flat array Konva expects: [offset, color, offset, color, ...]
export function toKonvaStops(stops: ColorStop[]): (number | string)[] {
  const out: (number | string)[] = []
  for (const s of stops) {
    out.push(s.offset, s.color)
  }
  return out
}

export type LocalBbox = { x: number; y: number; width: number; height: number }

// Default linear fill seeded from a starting color, fading to the same color
// at zero alpha. Endpoints span the bbox horizontally — a sensible neutral
// starting state that the on-canvas handles will personalize. Bbox is in
// the node's local frame, so for centered shapes (ellipse/polygon/star) the
// origin is negative and the gradient correctly stretches edge-to-edge.
export function defaultLinearFill(seedColor: string, bbox: LocalBbox): LinearFill {
  return {
    type: 'linear',
    stops: [
      { offset: 0, color: withAlpha(seedColor, 1) },
      { offset: 1, color: withAlpha(seedColor, 0) },
    ],
    start: { x: bbox.x, y: bbox.y + bbox.height / 2 },
    end: { x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2 },
  }
}

export function defaultRadialFill(seedColor: string, bbox: LocalBbox): RadialFill {
  return {
    type: 'radial',
    stops: [
      { offset: 0, color: withAlpha(seedColor, 1) },
      { offset: 1, color: withAlpha(seedColor, 0) },
    ],
    center: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 },
    radius: Math.max(bbox.width, bbox.height) / 2,
  }
}

export type FillKind = 'none' | 'solid' | 'linear' | 'radial'

export function fillKind(fill: Fill | null | undefined): FillKind {
  if (!fill) return 'none'
  return fill.type
}

// Switches a fill to a target type, preserving the seed color and (where
// possible) existing stops. Used by the FillEditor tab-switcher.
export function convertFill(
  from: Fill | null,
  to: FillKind,
  bbox: LocalBbox,
): Fill | null {
  if (to === 'none') return null
  const seed = fillSolidColor(from) ?? '#000000'
  if (to === 'solid') return solidFill(seed)
  if (to === 'linear') {
    if (from?.type === 'linear') return from
    if (from?.type === 'radial') {
      // Preserve stops; pick endpoints across the radial extent.
      return {
        type: 'linear',
        stops: from.stops,
        start: { x: from.center.x - from.radius, y: from.center.y },
        end: { x: from.center.x + from.radius, y: from.center.y },
      }
    }
    return defaultLinearFill(seed, bbox)
  }
  // radial
  if (from?.type === 'radial') return from
  if (from?.type === 'linear') {
    const cx = (from.start.x + from.end.x) / 2
    const cy = (from.start.y + from.end.y) / 2
    const dx = from.end.x - from.start.x
    const dy = from.end.y - from.start.y
    return {
      type: 'radial',
      stops: from.stops,
      center: { x: cx, y: cy },
      radius: Math.max(1, Math.hypot(dx, dy) / 2),
    }
  }
  return defaultRadialFill(seed, bbox)
}

// Scales a fill's geometry by sx/sy. Stops aren't touched (they're parametric
// in [0, 1]). Used by bakeScale after a Transformer-driven resize so the
// gradient stretches with the shape instead of staying anchored to the
// pre-resize pixel coords.
export function scaleFill(fill: Fill | null, sx: number, sy: number): Fill | null {
  if (!fill) return null
  if (fill.type === 'solid') return fill
  if (fill.type === 'linear') {
    return {
      ...fill,
      start: { x: fill.start.x * sx, y: fill.start.y * sy },
      end: { x: fill.end.x * sx, y: fill.end.y * sy },
    }
  }
  // Radial radius scales by the average — anisotropic scaling of a circular
  // ramp would technically need an ellipse-ramp (not in our model), so we
  // approximate. Center and focal scale with the bbox.
  const avg = (Math.abs(sx) + Math.abs(sy)) / 2
  return {
    ...fill,
    center: { x: fill.center.x * sx, y: fill.center.y * sy },
    radius: fill.radius * avg,
    focal: fill.focal ? { x: fill.focal.x * sx, y: fill.focal.y * sy } : undefined,
  }
}

// Konva render props for a fill. Only one fill mode is active at a time —
// passing both `fill` and `fillLinearGradient*` makes Konva pick gradient,
// but cleaner to leave `fill` undefined for gradients so the intent is
// explicit.
export function fillKonvaProps(fill: Fill | null | undefined): Record<string, unknown> {
  if (!fill) return { fill: undefined, fillEnabled: false }
  if (fill.type === 'solid') return { fill: fill.color, fillEnabled: true }
  if (fill.type === 'linear') {
    return {
      fill: undefined,
      fillEnabled: true,
      fillPriority: 'linear-gradient',
      fillLinearGradientStartPoint: fill.start,
      fillLinearGradientEndPoint: fill.end,
      fillLinearGradientColorStops: toKonvaStops(fill.stops),
    }
  }
  return {
    fill: undefined,
    fillEnabled: true,
    fillPriority: 'radial-gradient',
    fillRadialGradientStartPoint: fill.focal ?? fill.center,
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: fill.center,
    fillRadialGradientEndRadius: fill.radius,
    fillRadialGradientColorStops: toKonvaStops(fill.stops),
  }
}

// Mirror of fillKonvaProps for stroke. Konva supports
// strokeLinearGradient* / strokeRadialGradient* on every Shape — same shape
// as the fill props, prefixed with "stroke" instead of "fill".
export function strokeKonvaProps(stroke: Fill | null | undefined): Record<string, unknown> {
  if (!stroke) return { stroke: undefined, strokeEnabled: false }
  if (stroke.type === 'solid') return { stroke: stroke.color, strokeEnabled: true }
  if (stroke.type === 'linear') {
    return {
      stroke: undefined,
      strokeEnabled: true,
      strokeLinearGradientStartPoint: stroke.start,
      strokeLinearGradientEndPoint: stroke.end,
      strokeLinearGradientColorStops: toKonvaStops(stroke.stops),
    }
  }
  return {
    stroke: undefined,
    strokeEnabled: true,
    strokeRadialGradientStartPoint: stroke.focal ?? stroke.center,
    strokeRadialGradientStartRadius: 0,
    strokeRadialGradientEndPoint: stroke.center,
    strokeRadialGradientEndRadius: stroke.radius,
    strokeRadialGradientColorStops: toKonvaStops(stroke.stops),
  }
}

// Splits an 8-digit hex (#RRGGBBAA) into its 6-digit color and an opacity in
// [0, 1]. Used by SVG export — `<stop>` takes color and opacity as separate
// attributes, unlike CSS hex8.
export function splitColorOpacity(c: string): { color: string; opacity: number } {
  if (c.length === 9 && c.startsWith('#')) {
    const a = parseInt(c.slice(7, 9), 16)
    if (!Number.isFinite(a)) return { color: c.slice(0, 7), opacity: 1 }
    return { color: c.slice(0, 7), opacity: a / 255 }
  }
  return { color: c, opacity: 1 }
}

// Appends a 2-digit alpha hex to a 6-digit color hex. Inputs already carrying
// alpha are normalized — last 2 digits are replaced.
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
  const aHex = a.toString(16).padStart(2, '0')
  if (color.length === 9 && color.startsWith('#')) return color.slice(0, 7) + aHex
  if (color.length === 7 && color.startsWith('#')) return color + aHex
  return color
}

// Linearly interpolates between two hex colors (with optional alpha) in
// component space. Used by the stop-bar's "click empty bar to add a stop"
// flow so the new stop's color matches what the gradient would have been at
// that offset, instead of jumping to a neighbor's color.
export function interpolateColor(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return a
  const tt = Math.max(0, Math.min(1, t))
  const r = Math.round(ca.r + (cb.r - ca.r) * tt)
  const g = Math.round(ca.g + (cb.g - ca.g) * tt)
  const bl = Math.round(ca.b + (cb.b - ca.b) * tt)
  const al = Math.round(ca.a + (cb.a - ca.a) * tt)
  const head = `#${hex2(r)}${hex2(g)}${hex2(bl)}`
  return al < 255 ? `${head}${hex2(al)}` : head
}

// Picks the gradient color at the given offset by linearly interpolating
// between neighboring stops. Stops can arrive unsorted; we sort defensively.
export function colorAtOffset(stops: ColorStop[], offset: number): string {
  if (stops.length === 0) return '#000000'
  const sorted = [...stops].sort((a, b) => a.offset - b.offset)
  if (offset <= sorted[0].offset) return sorted[0].color
  const last = sorted[sorted.length - 1]
  if (offset >= last.offset) return last.color
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (offset >= a.offset && offset <= b.offset) {
      const span = b.offset - a.offset
      const t = span === 0 ? 0 : (offset - a.offset) / span
      return interpolateColor(a.color, b.color, t)
    }
  }
  return sorted[0].color
}

// Mirrors stops across offset 0.5 (offset = 1 - offset). Used by the panel's
// "Reverse stops" button so users can flip a gradient's direction without
// re-touching every stop.
export function reverseStops(stops: ColorStop[]): ColorStop[] {
  return stops.map((s) => ({ ...s, offset: 1 - s.offset }))
}

function parseHex(c: string): { r: number; g: number; b: number; a: number } | null {
  if (!c.startsWith('#')) return null
  if (c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
    return { r, g, b, a: 255 }
  }
  if (c.length === 9) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    const a = parseInt(c.slice(7, 9), 16)
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(a)) {
      return null
    }
    return { r, g, b, a }
  }
  return null
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
}
