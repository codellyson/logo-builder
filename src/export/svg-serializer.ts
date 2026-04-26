import type {
  BooleanNode,
  CanvasNode,
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
import { evaluateBoolean } from '@/composition/evaluate-boolean'
import { polygonPoints, starPoints } from '@/composition/to-path'
import { fillSolidColor, splitColorOpacity } from '@/composition/fills'

type StrokedAttrs = {
  stroke?: string | null
  strokeWidth?: number
  strokeCap?: StrokeCap
  strokeJoin?: StrokeJoin
}

function strokeAttrs(n: StrokedAttrs): string {
  if (!n.stroke) return ''
  const cap = n.strokeCap ?? 'butt'
  const join = n.strokeJoin ?? 'miter'
  return ` stroke="${n.stroke}" stroke-width="${n.strokeWidth}" stroke-linecap="${cap}" stroke-linejoin="${join}"`
}

type Opts = {
  width: number
  height: number
  nodes: CanvasNode[]
  background?: string | null
}

// Mutable accumulator threaded through the recursion. Gradient defs are
// collected here and emitted in a single <defs> block at the top of the SVG.
type Defs = {
  gradients: string[]
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
  return `<rect width="${n.width}" height="${n.height}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}${rx}/>`
}

function ellipseSvg(n: EllipseNode, defs: Defs): string {
  return `<ellipse rx="${n.radiusX}" ry="${n.radiusY}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}/>`
}

function lineSvg(n: LineNode): string {
  const pts: number[] = n.points
  if (pts.length < 4) return ''
  let d = `M${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
  return `<path d="${d}" fill="none"${strokeAttrs(n)}/>`
}

function pathSvg(n: PathNode, defs: Defs): string {
  return `<path d="${n.data}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}/>`
}

function polygonSvg(n: PolygonNode, defs: Defs): string {
  const pts = polygonPoints(n.sides, n.radius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}/>`
}

function starSvg(n: StarNode, defs: Defs): string {
  const pts = starPoints(n.points, n.outerRadius, n.innerRadius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}/>`
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
    const computed = await evaluateBoolean(n.id, allNodes)
    data = computed?.data
  }
  if (!data) return ''
  return `<path d="${data}" ${fillAttrFor(n.fill, n.id, defs)}${strokeAttrs(n)}/>`
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
  else if (n.type === 'line') body = lineSvg(n)
  else if (n.type === 'path') body = pathSvg(n, defs)
  else if (n.type === 'polygon') body = polygonSvg(n, defs)
  else if (n.type === 'star') body = starSvg(n, defs)
  else if (n.type === 'text') body = await textSvg(n, defs)
  else if (n.type === 'icon') body = await iconSvg(n, defs)
  else if (n.type === 'boolean') body = await booleanSvg(n, allNodes, defs)
  return `<g${tf}${opacity}${blend}>${body}</g>`
}

export async function serializeSvg({ nodes, width, height, background }: Opts): Promise<string> {
  const childrenOf = new Map<string, CanvasNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const arr = childrenOf.get(n.parentId)
    if (arr) arr.push(n)
    else childrenOf.set(n.parentId, [n])
  }
  const defs: Defs = { gradients: [] }
  const topLevel = nodes.filter((n) => !n.parentId && !n.hidden)
  const bodies: string[] = []
  for (const n of topLevel) bodies.push(await nodeSvg(n, childrenOf, nodes, defs))
  const bg = background
    ? `<rect width="${width}" height="${height}" fill="${background}"/>`
    : ''
  const defsBlock = defs.gradients.length ? `<defs>${defs.gradients.join('')}</defs>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defsBlock}${bg}${bodies.join('')}</svg>`
}
