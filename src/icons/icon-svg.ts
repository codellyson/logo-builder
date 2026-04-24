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
