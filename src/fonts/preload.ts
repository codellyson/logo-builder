import { BUNDLED_FONTS } from '@/fonts/registry'

export const FONTS_LOADED_EVENT = 'logo-builder:fonts-loaded'

export async function preloadCuratedFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const jobs: Promise<FontFace[]>[] = []
  for (const font of BUNDLED_FONTS) {
    for (const weight of font.weights) {
      jobs.push(document.fonts.load(`${weight} 48px "${font.family}"`))
    }
  }
  await Promise.allSettled(jobs)
  window.dispatchEvent(new Event(FONTS_LOADED_EVENT))
}
