import { converter, formatHex, parse, clampChroma, wcagContrast } from 'culori'

const toOklch = converter('oklch')
const toRgb = converter('rgb')

export type Oklch = { l: number; c: number; h: number }

export function parseColor(input: string): Oklch | null {
  const parsed = parse(input)
  if (!parsed) return null
  const o = toOklch(parsed)
  if (!o) return null
  return { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 }
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
  return formatHex(toRgb(clamped)) ?? '#000000'
}

export function withLightness(input: Oklch, l: number): Oklch {
  return { ...input, l }
}

export function withChroma(input: Oklch, c: number): Oklch {
  return { ...input, c }
}

export function withHue(input: Oklch, h: number): Oklch {
  return { ...input, h }
}

export function rotateHue(input: Oklch, degrees: number): Oklch {
  const h = ((input.h + degrees) % 360 + 360) % 360
  return { ...input, h }
}

export function contrast(a: string, b: string): number {
  return wcagContrast(a, b) ?? 1
}

export function ensureContrast(fg: Oklch, bg: string, target = 4.5): Oklch {
  let candidate = fg
  for (let i = 0; i < 30; i++) {
    const hex = oklchToHex(candidate)
    if (contrast(hex, bg) >= target) return candidate
    // push lightness away from bg's lightness
    const bgO = parseColor(bg)
    if (!bgO) return candidate
    if (bgO.l > 0.5) candidate = { ...candidate, l: Math.max(0, candidate.l - 0.03) }
    else candidate = { ...candidate, l: Math.min(1, candidate.l + 0.03) }
  }
  return candidate
}
