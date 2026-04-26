import type { LinearFill, RadialFill } from '@/canvas/types'
import { splitColorOpacity } from '@/composition/fills'

const svgCache = new Map<string, Promise<string>>()

export async function fetchIconSvg(iconName: string, color: string): Promise<string> {
  const key = `${iconName}::${color}`
  const cached = svgCache.get(key)
  if (cached) return cached
  const [prefix, name] = iconName.split(':')
  if (!prefix || !name) return ''
  const c = encodeURIComponent(color)
  const url = `https://api.iconify.design/${prefix}/${name}.svg?color=${c}&height=256`
  const p = fetch(url)
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '')
  svgCache.set(key, p)
  return p
}

export async function loadIconImage(iconName: string, color: string): Promise<HTMLImageElement | null> {
  const svg = await fetchIconSvg(iconName, color)
  if (!svg || !svg.startsWith('<svg')) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

// Rasterizes an icon with a gradient pre-applied — the SVG is fetched once
// with a sentinel color, then every fill attr is rewritten to a `url(#id)`
// ref and the gradient def is injected inline. The `gradientTransform`
// compensates for the icon's viewBox→pixel scale so endpoints stay in
// node-local coords like every other node, despite the paths being drawn
// in viewBox space.
export async function loadIconImageWithGradient(
  iconName: string,
  fill: LinearFill | RadialFill,
  nodeWidth: number,
  nodeHeight: number,
): Promise<HTMLImageElement | null> {
  const svg = await fetchIconSvg(iconName, '#000000')
  if (!svg || !svg.startsWith('<svg')) return null

  const vbMatch = svg.match(/viewBox="([^"]+)"/)
  let vbW = 24,
    vbH = 24
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/).map(Number)
    if (parts.length === 4) {
      vbW = parts[2]
      vbH = parts[3]
    }
  }

  const id = 'icon-grad'
  const stops = fill.stops
    .map((s) => {
      const { color, opacity } = splitColorOpacity(s.color)
      const op = opacity < 1 ? ` stop-opacity="${opacity}"` : ''
      return `<stop offset="${s.offset}" stop-color="${color}"${op}/>`
    })
    .join('')
  const gt = `gradientTransform="scale(${vbW / nodeWidth} ${vbH / nodeHeight})"`
  const def =
    fill.type === 'linear'
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ${gt} x1="${fill.start.x}" y1="${fill.start.y}" x2="${fill.end.x}" y2="${fill.end.y}">${stops}</linearGradient>`
      : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ${gt} cx="${fill.center.x}" cy="${fill.center.y}" r="${fill.radius}" fx="${fill.focal?.x ?? fill.center.x}" fy="${fill.focal?.y ?? fill.center.y}">${stops}</radialGradient>`

  let modified = svg.replace(/<svg([^>]*)>/, `<svg$1><defs>${def}</defs>`)
  modified = modified.replace(/fill="(?!none)[^"]*"/g, `fill="url(#${id})"`)

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(modified)}`
  })
}

export type IconSearchResult = {
  icons: string[]
  total: number
}

export async function searchIcons(query: string, prefixes: string[]): Promise<IconSearchResult> {
  const q = query.trim()
  if (!q) return { icons: [], total: 0 }
  const params = new URLSearchParams({
    query: q,
    limit: '64',
    prefixes: prefixes.join(','),
  })
  try {
    const res = await fetch(`https://api.iconify.design/search?${params.toString()}`)
    if (!res.ok) return { icons: [], total: 0 }
    const data = (await res.json()) as { icons?: string[]; total?: number }
    return { icons: data.icons ?? [], total: data.total ?? 0 }
  } catch {
    return { icons: [], total: 0 }
  }
}
