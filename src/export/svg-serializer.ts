import type {
  BooleanNode,
  CanvasNode,
  EllipseNode,
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

function transform(n: CanvasNode): string {
  if (n.rotation === 0) return `translate(${n.x} ${n.y})`
  return `translate(${n.x} ${n.y}) rotate(${n.rotation})`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rectSvg(n: RectNode): string {
  const rx = n.cornerRadius ? ` rx="${n.cornerRadius}" ry="${n.cornerRadius}"` : ''
  return `<rect width="${n.width}" height="${n.height}" fill="${n.fill}"${strokeAttrs(n)}${rx}/>`
}

function ellipseSvg(n: EllipseNode): string {
  return `<ellipse rx="${n.radiusX}" ry="${n.radiusY}" fill="${n.fill}"${strokeAttrs(n)}/>`
}

function lineSvg(n: LineNode): string {
  const pts: number[] = n.points
  if (pts.length < 4) return ''
  let d = `M${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
  return `<path d="${d}" fill="none"${strokeAttrs(n)}/>`
}

function pathSvg(n: PathNode): string {
  const fill = n.fill ? `fill="${n.fill}"` : 'fill="none"'
  return `<path d="${n.data}" ${fill}${strokeAttrs(n)}/>`
}

function polygonSvg(n: PolygonNode): string {
  const pts = polygonPoints(n.sides, n.radius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" fill="${n.fill}"${strokeAttrs(n)}/>`
}

function starSvg(n: StarNode): string {
  const pts = starPoints(n.points, n.outerRadius, n.innerRadius)
  const joined: string[] = []
  for (let i = 0; i < pts.length; i += 2) joined.push(`${pts[i]},${pts[i + 1]}`)
  return `<polygon points="${joined.join(' ')}" fill="${n.fill}"${strokeAttrs(n)}/>`
}

async function textSvg(n: TextNode): Promise<string> {
  const outlined = await textToOutlines(n)
  if (outlined) {
    return `<path d="${outlined.data}" fill="${n.fill}"/>`
  }
  const weight = n.fontStyle.includes('bold') ? 700 : 400
  const italic = n.fontStyle.includes('italic') ? ' font-style="italic"' : ''
  const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start'
  const xOffset = n.align === 'center' ? n.width / 2 : n.align === 'right' ? n.width : 0
  return `<text x="${xOffset}" y="${n.fontSize}" font-family="${escapeXml(n.fontFamily)}" font-size="${n.fontSize}" font-weight="${weight}"${italic} fill="${n.fill}" letter-spacing="${n.letterSpacing}" text-anchor="${anchor}">${escapeXml(n.text)}</text>`
}

async function iconSvg(n: IconNode): Promise<string> {
  const svg = await fetchIconSvg(n.iconName, n.fill)
  if (!svg) return ''
  const vbMatch = svg.match(/viewBox="([^"]+)"/)
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
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
  return `<g transform="scale(${sx} ${sy})">${inner}</g>`
}

async function booleanSvg(n: BooleanNode, allNodes: CanvasNode[]): Promise<string> {
  let data = n.cache?.data
  if (!data) {
    const computed = await evaluateBoolean(n.id, allNodes)
    data = computed?.data
  }
  if (!data) return ''
  const fill = n.fill ? `fill="${n.fill}"` : 'fill="none"'
  return `<path d="${data}" ${fill}${strokeAttrs(n)}/>`
}

async function nodeSvg(
  n: CanvasNode,
  childrenOf: Map<string, CanvasNode[]>,
  allNodes: CanvasNode[],
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
    for (const c of children) childSvgs.push(await nodeSvg(c, childrenOf, allNodes))
    return `<g${tf}${opacity}${blend}>${childSvgs.join('')}</g>`
  }

  let body = ''
  if (n.type === 'rect') body = rectSvg(n)
  else if (n.type === 'ellipse') body = ellipseSvg(n)
  else if (n.type === 'line') body = lineSvg(n)
  else if (n.type === 'path') body = pathSvg(n)
  else if (n.type === 'polygon') body = polygonSvg(n)
  else if (n.type === 'star') body = starSvg(n)
  else if (n.type === 'text') body = await textSvg(n)
  else if (n.type === 'icon') body = await iconSvg(n)
  else if (n.type === 'boolean') body = await booleanSvg(n, allNodes)
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
  const topLevel = nodes.filter((n) => !n.parentId && !n.hidden)
  const bodies: string[] = []
  for (const n of topLevel) bodies.push(await nodeSvg(n, childrenOf, nodes))
  const bg = background
    ? `<rect width="${width}" height="${height}" fill="${background}"/>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${bg}${bodies.join('')}</svg>`
}
