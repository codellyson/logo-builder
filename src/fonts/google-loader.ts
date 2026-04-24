import { get, set } from 'idb-keyval'

const CACHE_PREFIX = 'gf-css:'
const loaded = new Set<string>()

export async function loadGoogleFont(family: string, weights: number[] = [400, 700]): Promise<void> {
  const key = `${family}:${weights.join(',')}`
  if (loaded.has(key)) return

  const fam = family.replace(/\s+/g, '+')
  const weightSpec = weights.join(';')
  const url = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weightSpec}&display=swap`

  let css = (await get<string>(CACHE_PREFIX + key)) ?? null
  if (!css) {
    try {
      const res = await fetch(url, {
        headers: {
          // UA hint so Google returns woff2 rather than legacy formats
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      })
      if (!res.ok) throw new Error(`font fetch failed: ${res.status}`)
      css = await res.text()
      await set(CACHE_PREFIX + key, css)
    } catch (err) {
      console.warn('Failed to load Google Font', family, err)
      return
    }
  }

  const style = document.createElement('style')
  style.dataset.googleFont = key
  style.textContent = css
  document.head.appendChild(style)
  loaded.add(key)
}
