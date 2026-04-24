import { ensureContrast, oklchToHex, parseColor, rotateHue, withChroma, withLightness } from '@/colors/oklch'

export type PaletteRole = 'primary' | 'accent' | 'ink' | 'paper' | 'muted'

export type Palette = {
  seed: string
  primary: string
  accent: string
  ink: string
  paper: string
  muted: string
}

export const DEFAULT_PALETTE: Palette = generatePalette('#6366f1')

export function generatePalette(seedHex: string): Palette {
  const seed = parseColor(seedHex)
  if (!seed) return DEFAULT_PALETTE

  const primary = { ...seed, l: clamp(seed.l, 0.55, 0.7), c: Math.max(seed.c, 0.12) }
  const accent = rotateHue(withLightness(withChroma(seed, Math.max(seed.c, 0.14)), 0.65), 30)
  const paper = { l: 0.98, c: 0.005, h: seed.h }
  const paperHex = oklchToHex(paper)
  const ink = ensureContrast({ l: 0.18, c: 0.015, h: seed.h }, paperHex, 10)
  const muted = withChroma(withLightness(seed, 0.88), Math.min(seed.c * 0.4, 0.04))

  return {
    seed: seedHex,
    primary: oklchToHex(primary),
    accent: oklchToHex(accent),
    ink: oklchToHex(ink),
    paper: paperHex,
    muted: oklchToHex(muted),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export const ROLE_LABELS: Record<PaletteRole, string> = {
  primary: 'Primary',
  accent: 'Accent',
  ink: 'Ink',
  paper: 'Paper',
  muted: 'Muted',
}

export const ROLE_ORDER: PaletteRole[] = ['primary', 'accent', 'ink', 'muted', 'paper']
