import interR from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import interB from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import manropeR from '@fontsource/manrope/files/manrope-latin-400-normal.woff?url'
import manropeB from '@fontsource/manrope/files/manrope-latin-700-normal.woff?url'
import spaceR from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?url'
import spaceB from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url'
import dmR from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url'
import dmB from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url'
import archR from '@fontsource/archivo/files/archivo-latin-400-normal.woff?url'
import archB from '@fontsource/archivo/files/archivo-latin-700-normal.woff?url'
import soraR from '@fontsource/sora/files/sora-latin-400-normal.woff?url'
import soraB from '@fontsource/sora/files/sora-latin-700-normal.woff?url'
import syneR from '@fontsource/syne/files/syne-latin-400-normal.woff?url'
import syneB from '@fontsource/syne/files/syne-latin-700-normal.woff?url'
import bebasR from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url'
import unboundedR from '@fontsource/unbounded/files/unbounded-latin-400-normal.woff?url'
import unboundedB from '@fontsource/unbounded/files/unbounded-latin-700-normal.woff?url'
import playfairR from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url'
import playfairB from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url'
import fraunR from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff?url'
import fraunB from '@fontsource/fraunces/files/fraunces-latin-700-normal.woff?url'
import dmSerifR from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff?url'
import crimsonR from '@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff?url'
import crimsonB from '@fontsource/crimson-pro/files/crimson-pro-latin-700-normal.woff?url'
import plexR from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url'
import plexB from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff?url'
import jetR from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url'
import jetB from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url'

export const FONT_FILE_URLS: Record<string, Partial<Record<400 | 700, string>>> = {
  Inter: { 400: interR, 700: interB },
  Manrope: { 400: manropeR, 700: manropeB },
  'Space Grotesk': { 400: spaceR, 700: spaceB },
  'DM Sans': { 400: dmR, 700: dmB },
  Archivo: { 400: archR, 700: archB },
  Sora: { 400: soraR, 700: soraB },
  Syne: { 400: syneR, 700: syneB },
  'Bebas Neue': { 400: bebasR },
  Unbounded: { 400: unboundedR, 700: unboundedB },
  'Playfair Display': { 400: playfairR, 700: playfairB },
  Fraunces: { 400: fraunR, 700: fraunB },
  'DM Serif Display': { 400: dmSerifR },
  'Crimson Pro': { 400: crimsonR, 700: crimsonB },
  'IBM Plex Mono': { 400: plexR, 700: plexB },
  'JetBrains Mono': { 400: jetR, 700: jetB },
}

export function fontFileUrl(family: string, weight: 400 | 700): string | null {
  return FONT_FILE_URLS[family]?.[weight] ?? null
}
