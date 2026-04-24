import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/700.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/700.css'
import '@fontsource/syne/400.css'
import '@fontsource/syne/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/unbounded/400.css'
import '@fontsource/unbounded/700.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/700.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

export type FontCategory = 'sans' | 'display' | 'serif' | 'mono'

export type FontSpec = {
  id: string
  family: string
  category: FontCategory
  weights: number[]
  source: 'bundled' | 'google'
}

export const BUNDLED_FONTS: FontSpec[] = [
  { id: 'inter', family: 'Inter', category: 'sans', weights: [400, 700], source: 'bundled' },
  { id: 'manrope', family: 'Manrope', category: 'sans', weights: [400, 700], source: 'bundled' },
  { id: 'space-grotesk', family: 'Space Grotesk', category: 'sans', weights: [400, 700], source: 'bundled' },
  { id: 'dm-sans', family: 'DM Sans', category: 'sans', weights: [400, 700], source: 'bundled' },
  { id: 'archivo', family: 'Archivo', category: 'sans', weights: [400, 700], source: 'bundled' },
  { id: 'sora', family: 'Sora', category: 'display', weights: [400, 700], source: 'bundled' },
  { id: 'syne', family: 'Syne', category: 'display', weights: [400, 700], source: 'bundled' },
  { id: 'bebas-neue', family: 'Bebas Neue', category: 'display', weights: [400], source: 'bundled' },
  { id: 'unbounded', family: 'Unbounded', category: 'display', weights: [400, 700], source: 'bundled' },
  { id: 'playfair-display', family: 'Playfair Display', category: 'serif', weights: [400, 700], source: 'bundled' },
  { id: 'fraunces', family: 'Fraunces', category: 'serif', weights: [400, 700], source: 'bundled' },
  { id: 'dm-serif-display', family: 'DM Serif Display', category: 'serif', weights: [400], source: 'bundled' },
  { id: 'crimson-pro', family: 'Crimson Pro', category: 'serif', weights: [400, 700], source: 'bundled' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', category: 'mono', weights: [400, 700], source: 'bundled' },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', category: 'mono', weights: [400, 700], source: 'bundled' },
]

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans',
  display: 'Display',
  serif: 'Serif',
  mono: 'Mono',
}

export function findFont(family: string): FontSpec | null {
  return BUNDLED_FONTS.find((f) => f.family === family) ?? null
}
