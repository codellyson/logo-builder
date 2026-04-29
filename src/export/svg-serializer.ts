import type {
  AssetNode,
  BooleanNode,
  CanvasNode,
  Effect,
  EllipseNode,
  Fill,
  IconNode,
  LineNode,
  PathNode,
  PolygonNode,
  RectNode,
  StarNode,
  StrokeCap,
  StrokeJoin,
  TextNode,
} from '@/canvas/types'
import { fetchIconSvg } from '@/icons/icon-svg'
import { textToOutlines } from '@/composition/text-to-outlines'
import { polygonPoints, starPoints } from '@/composition/to-path'
import { fillSolidColor, splitColorOpacity } from '@/composition/fills'
import { getAsset } from '@/persistence/assets'

type StrokedAttrs = {
  stroke?: Fill | null
  strokeWidth?: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
}

// Solid stroke → `stroke="hex"`. Gradient stroke → emits a separate
// gradient def with id `s-${nodeId}` (alongside any fill gradient under
// `g-${nodeId}`) and references it via `stroke="url(#)"`. Same
// `userSpaceOnUse` convention as fills so coords stay in node-local frame.
function strokeAttrs(n: StrokedAttrs & { id?: string }, defs?: Defs): string {
  if (!n.stroke) return ''
  const cap = n.strokeCap ?? 'butt'
  const join = n.strokeJoin ?? 'miter'
  const widthAndJoinTail = ` stroke-width="${n.strokeWidth}" stroke-linecap="${cap}" stroke-linejoin="${join}"`
  if (n.stroke.type === 'solid') {
    const { color, opacity } = splitColorOpacity(n.stroke.color)
    const op = opacity < 1 ? ` stroke-opacity="${opacity}"` : ''
    return ` stroke="${color}"${op}${widthAndJoinTail}`
  }
  if (!n.id || !defs) {
    // Fallback: caller didn't thread defs/id through. Collapse to first stop.
    const fallback = fillSolidColor(n.stroke) ?? '#000000'
    return ` stroke="${fallback}"${widthAndJoinTail}`
  }
  const id = strokeGradientId(n.id)
  if (n.stroke.type === 'linear') {
    defs.gradients.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n.stroke.start.x}" y1="${n.stroke.start.y}" x2="${n.stroke.end.x}" y2="${n.stroke.end.y}">${stopXml(n.stroke.stops)}</linearGradient>`,
    )
  } else {
    const fx = n.stroke.focal?.x ?? n.stroke.center.x
    const fy = n.stroke.focal?.y ?? n.stroke.center.y
    defs.gradients.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n.stroke.center.x}" cy="${n.stroke.center.y}" r="${n.stroke.radius}" fx="${fx}" fy="${fy}">${stopXml(n.stroke.stops)}</radialGradient>`,
    )
  }
  return ` stroke="url(#${id})"${widthAndJoinTail}`
}

function strokeGradientId(nodeId: string): string {
  return `s-${nodeId}`
}

type Opts = {
  width: number
  height: number
  nodes: CanvasNode[]
  background?: string | null
  // Optional uniform padding in node-local px applied to the viewBox on
  // every side. Used by export to give app-icon-style safe area without
  // mutating node positions.
  padding?: number
}

// Mutable accumulator threaded through the recursion. Gradient and filter
// defs are collected here and emitted in a single <defs> block at the top
// of the SVG.
type Defs = {
  gradients: string[]
  filters: string[]
  clipPaths: string[]
}

// Builds an SVG `<filter>` for a single effect. Filter region is set
// generously (-50% / 200%) so large blurs / shadows don't clip in the
// default objectBoundingBox region (-10% / 120%).
function effectFilterXml(id: string, eff: Effect): string | null {
  if (!eff.enabled) return null
  const open = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">`
  const close = `</filter>`
  if (eff.type === 'drop-shadow' || eff.type === 'outer-glow') {
    const dx = eff.type === 'drop-shadow' ? eff.offsetX : 0
    const dy = eff.type === 'drop-shadow' ? eff.offsetY : 0
    const { color, opacity } = splitColorOpacity(eff.color)
    const finalOpacity = opacity * eff.opacity
    return [
      open,
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${eff.blur}"/>`,
      `<feOffset dx="${dx}" dy="${dy}" result="off"/>`,
      `<feFlood flood-color="${color}" flood-opacity="${finalOpacity}"/>`,
      `<feComposite in2="off" operator="in"/>`,
      `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`,
      close,
    ].join('')
  }
  if (eff.type === 'blur') {
    return `${open}<feGaussianBlur stdDeviation="${eff.radius}"/>${close}`
  }
  return null
}

// Wraps `inner` in a chain of `<g filter="url(#…)">` elements — one per
// enabled shadow-like effect — and emits each filter into `defs.filters`.
// Effects render in array order: effects[0] is innermost (closest to the
// geometry), effects[last] is outermost. Returns the wrapped SVG string.
function wrapWithEffects(nodeId: string, effects: Effect[] | undefined, inner: string, defs: Defs): string {
  if (!effects || effects.length === 0) return inner
  let wrapped = inner
  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i]
    const filterId = `e-${nodeId}-${i}`
    const filterXml = effectFilterXml(filterId, eff)
    if (!filterXml) continue
    defs.filters.push(filterXml)
    wrapped = `<g filter="url(#${filterId})">${wrapped}</g>`
  }
  return wrapped
}

function transform(n: CanvasNode): string {
  if (n.rotation === 0) return `translate(${n.x} ${n.y})`
  return `translate(${n.x} ${n.y}) rotate(${n.rotation})`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function gradientId(nodeId: string): string {
  return `g-${nodeId}`
}

function stopXml(stops: { offset: number; color: string }[]): string {
  return stops
    .map((s) => {
      const { color, opacity } = splitColorOpacity(s.color)
      const op = opacity < 1 ? ` stop-opacity="${opacity}"` : ''
      return `<stop offset="${s.offset}" stop-color="${color}"${op}/>`
    })
    .join('')
}

// Emits a <linearGradient>/<radialGradient> def for a gradient fill and
// returns the `fill="url(#id)"` attr that references it. Solids stay as
// `fill="..."`. Null fills become `fill="none"`. `userSpaceOnUse` makes the
// gradient coords identical to the node's local frame, matching Konva's
// rendering of the same fill.
function fillAttrFor(
  fill: Fill | null | undefined,
  nodeId: string,
  defs: Defs,
): string {
  if (!fill) return 'fill="none"'
  if (fill.type === 'solid') {
    const { color, opacity } = splitColorOpacity(fill.color)
    return opacity < 1
      ? `fill="${color}" fill-opacity="${opacity}"`
      : `fill="${color}"`
  }
  const id = gradientId(nodeId)
  if (fill.type === 'linear') {
    defs.gradients.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fill.start.x}" y1="${fill.start.y}" x2="${fill.end.x}" y2="${fill.end.y}">${stopXml(fill.stops)}</linearGradient>`,
    )
  } else {
    const fx = fill.focal?.x ?? fill.center.x
    const fy = fill.focal?.y ?? fill.center.y
    defs.gradients.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fill.center.x}" cy="${fill.center.y}" r="${fill.radius}" fx="${fx}" fy="${fy}">${stopXml(fill.stops)}</radialGradient>`,
    )
  }
  return `fill="url(#${id})"`
}

function rectSvg(n: RectNode, defs: Defs): string {
  const rx = n.cornerRadius ? ` rx="${n.cornerRadius}" ry="${n.cornerRadius}"` : ''
  return `<rect width="${n.width}" height="${n.height}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}${rx}/>`
}

function ellipseSvg(n: EllipseNode, defs: Defs): string {
  return `<ellipse rx="${n.radiusX}" ry="${n.radiusY}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}/>`
}

function lineSvg(n: LineNode, defs: Defs): string {
  const pts: number[] = n.points
  if (pts.length < 4) return ''
  let d = `M${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
  return `<path d="${d}" fill="none"${strokeAttrs(n, defs)}/>`
}

function pathSvg(n: PathNode, defs: Defs): string {
  return `<path d="${n.data}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}/>`
}

function polygonSvg(n: PolygonNode, defs: Defs): string {
  const pts = polygonPoints(n.sides, n.radius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}/>`
}

function starSvg(n: StarNode, defs: Defs): string {
  const pts = starPoints(n.points, n.outerRadius, n.innerRadius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}/>`
}

async function textSvg(n: TextNode, defs: Defs): Promise<string> {
  const outlined = await textToOutlines(n)
  if (outlined) {
    return `<path d="${outlined.data}" ${fillAttrFor(n.fill, n.id, defs)}/>`
  }
  // Non-outlined fallback (font failed to load) — gradients collapse to first
  // stop because <text> can't reasonably take a gradient ref the way <path>
  // can in all renderers. Outlining is the common case anyway.
  const fillHex = fillSolidColor(n.fill) ?? '#000000'
  const weight = n.fontStyle.includes('bold') ? 700 : 400
  const italic = n.fontStyle.includes('italic') ? ' font-style="italic"' : ''
  const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start'
  const xOffset = n.align === 'center' ? n.width / 2 : n.align === 'right' ? n.width : 0
  return `<text x="${xOffset}" y="${n.fontSize}" font-family="${escapeXml(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${weight}"${italic} fill="${fillHex}" letter-spacing="${n.letterSpacing}" text-anchor="${anchor}">${escapeXml(n.text)}</text>`
}

async function iconSvg(n: IconNode, defs: Defs): Promise<string> {
  // For a solid fill we let iconify pre-substitute the color into the SVG.
  // For a gradient we fetch with a sentinel hex, rewrite every fill attr to
  // a `url(#g-id)` ref, and emit a gradient def whose `gradientTransform`
  // compensates for the icon's viewBox→pixel scale (so the gradient lives
  // in node-local coords like every other node, even though the icon's
  // paths are drawn in viewBox space).
  const isGradient = !!n.fill && n.fill.type !== 'solid'
  const fillHex = isGradient ? '#000000' : fillSolidColor(n.fill) ?? '#000000'
  const svg = await fetchIconSvg(n.iconName, fillHex)
  if (!svg) return ''
  const vbMatch = svg.match(/viewBox="([^"]+)"/)
  let inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  let vbW = 24,
    vbH = 24
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/).map(Number)
    if (parts.length === 4) {
      vbW = parts[2]
      vbH = parts[3]
    }
  }
  const sx = n.width / vbW
  const sy = n.height / vbH

  if (isGradient && n.fill && n.fill.type !== 'solid') {
    const id = gradientId(n.id)
    inner = inner.replace(/fill="(?!none)[^"]*"/g, `fill="url(#${id})"`)
    const gt = `gradientTransform="scale(${vbW / n.width} ${vbH / n.height})"`
    if (n.fill.type === 'linear') {
      defs.gradients.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${gt} x1="${n.fill.start.x}" y1="${n.fill.start.y}" x2="${n.fill.end.x}" y2="${n.fill.end.y}">${stopXml(n.fill.stops)}</linearGradient>`,
      )
    } else {
      const fx = n.fill.focal?.x ?? n.fill.center.x
      const fy = n.fill.focal?.y ?? n.fill.center.y
      defs.gradients.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ${gt} cx="${n.fill.center.x}" cy="${n.fill.center.y}" r="${n.fill.radius}" fx="${fx}" fy="${fy}">${stopXml(n.fill.stops)}</radialGradient>`,
      )
    }
  }
  return `<g transform="scale(${sx} ${sy})">${inner}</g>`
}

async function booleanSvg(n: BooleanNode, allNodes: CanvasNode[], defs: Defs): Promise<string> {
  let data = n.cache?.data
  if (!data) {
    // evaluate-boolean pulls paper.js via node-to-path; dynamic-import
    // means LayerThumbnail / serializeSvg only load that graph when a
    // boolean actually needs evaluation.
    const { evaluateBoolean } = await import('@/composition/evaluate-boolean')
    const computed = await evaluateBoolean(n.id, allNodes)
    data = computed?.data
  }
  if (!data) return ''
  return `<path d="${data}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n, defs)}/>`
}

// Raster assets export as `<image>` with a base64 data URL so the SVG is
// fully self-contained. SVG assets export by inlining the asset's body
// inside a `<g transform="scale(sx sy)">` wrapper — same pattern as
// icons. Missing assets emit nothing (fail-soft; the canvas placeholder
// is enough of a signal in the editor).
//
// Crop: emits a `<clipPath>` whose <rect> is rotated around its center.
// The clip path's userSpaceOnUse coords are image-local (matching the
// runtime clipFunc), so the parent <g transform="..."> applies the
// image's outer transform on top.
async function assetSvg(n: AssetNode, defs: Defs): Promise<string> {
  const rec = await getAsset(n.assetId)
  if (!rec) return ''
  let body = ''
  if (rec.kind === 'image') {
    const dataUrl = await blobToDataURL(rec.blob)
    body = `<image href="${dataUrl}" width="${n.width}" height="${n.height}" preserveAspectRatio="none"/>`
  } else if (rec.kind === 'svg') {
    const text = await rec.blob.text()
    const inner = text.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    const sx = rec.width === 0 ? 1 : n.width / rec.width
    const sy = rec.height === 0 ? 1 : n.height / rec.height
    body = `<g transform="scale(${sx} ${sy})">${inner}</g>`
  } else {
    return ''
  }
  const c = n.crop
  if (!c) return body
  const clipId = `crop-${n.id}`
  if (c.kind === 'rect') {
    const cx = c.x + c.width / 2
    const cy = c.y + c.height / 2
    const rotXf = c.rotation ? ` transform="rotate(${c.rotation} ${cx} ${cy})"` : ''
    defs.clipPaths.push(
      `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}"${rotXf}/></clipPath>`,
    )
  } else {
    defs.clipPaths.push(
      `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${c.data}"/></clipPath>`,
    )
  }
  return `<g clip-path="url(#${clipId})">${body}</g>`
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

async function nodeSvg(
  n: CanvasNode,
  childrenOf: Map<string, CanvasNode[]>,
  allNodes: CanvasNode[],
  defs: Defs,
): Promise<string> {
  if (n.hidden) return ''
  const opacity = n.opacity !== 1 ? ` opacity="${n.opacity}"` : ''
  const tf = ` transform="${transform(n)}"`
  const blend =
    n.blendMode && n.blendMode !== 'source-over'
      ? ` style="mix-blend-mode: ${n.blendMode}"`
      : ''

  if (n.type === 'group') {
    const children = childrenOf.get(n.id) ?? []
    const childSvgs: string[] = []
    for (const c of children) childSvgs.push(await nodeSvg(c, childrenOf, allNodes, defs))
    return `<g${tf}${opacity}${blend}>${childSvgs.join('')}</g>`
  }

  let body = ''
  if (n.type === 'rect') body = rectSvg(n, defs)
  else if (n.type === 'ellipse') body = ellipseSvg(n, defs)
  else if (n.type === 'line') body = lineSvg(n, defs)
  else if (n.type === 'path') body = pathSvg(n, defs)
  else if (n.type === 'polygon') body = polygonSvg(n, defs)
  else if (n.type === 'star') body = starSvg(n, defs)
  else if (n.type === 'text') body = await textSvg(n, defs)
  else if (n.type === 'icon') body = await iconSvg(n, defs)
  else if (n.type === 'boolean') body = await booleanSvg(n, allNodes, defs)
  else if (n.type === 'asset') body = await assetSvg(n, defs)
  const wrapped = wrapWithEffects(n.id, n.effects, body, defs)
  return `<g${tf}${opacity}${blend}>${wrapped}</g>`
}

export async function serializeSvg({ nodes, width, height, background, padding }: Opts): Promise<string> {
  const childrenOf = new Map<string, CanvasNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n)
    else childrenOf.set(n.parentId, [n])
  }
  const defs: Defs = { gradients: [], filters: [], clipPaths: [] }
  const topLevel = nodes.filter((n) => !n.parentId && !n.hidden)
  const bodies: string[] = []
  for (const n of topLevel) bodies.push(await nodeSvg(n, childrenOf, nodes, defs))
  // Padding extends the viewBox on every side. The artboard stays at
  // (0, 0) → (width, height); the negative offset on viewBox shifts the
  // origin so the artboard is centered inside the padded frame.
  const p = Math.max(0, padding ?? 0)
  const vbX = -p
  const vbY = -p
  const vbW = width + 2 * p
  const vbH = height + 2 * p
  const bg = background
    ? `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${background}"/>`
    : ''
  const defsContent = defs.gradients.join('') + defs.filters.join('') + defs.clipPaths.join('')
  const defsBlock = defsContent ? `<defs>${defsContent}</defs>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">${defsBlock}${bg}${bodies.join('')}</svg>`
}
