import { serializeSvg } from '@/export/svg-serializer'
import { svgToPngBlob, svgToPngDataUrl } from '@/export/raster'
import { encodeIco } from '@/export/ico'
import { deriveVariant, type LockupVariant } from '@/export/lockups'
import type { CanvasNode } from '@/canvas/types'
import type JSZipType from 'jszip'

// jszip + svgo together are ~190 kB gz; both are export-only and the
// existing call sites are all async, so we dynamic-import them on first
// use. Module identity is cached so the second export reuses the same
// instance.
let svgoModulePromise: Promise<typeof import('svgo')> | null = null
function loadSvgo(): Promise<typeof import('svgo')> {
  svgoModulePromise ??= import('svgo')
  return svgoModulePromise
}

let jszipModulePromise: Promise<{ default: typeof JSZipType }> | null = null
function loadJSZip(): Promise<{ default: typeof JSZipType }> {
  jszipModulePromise ??= import('jszip')
  return jszipModulePromise
}

export type ExportFormat = 'svg' | 'png' | 'favicon'

// Background to apply to the `original` variant. Mono variants and
// transparent variants (icon-only / wordmark-only) ignore this — they
// have semantically required backgrounds.
export type ExportBackground =
  | { type: 'transparent' }
  | { type: 'artboard' }
  | { type: 'custom'; color: string }

export type ExportSelection = {
  variants: LockupVariant[]
  sizes: number[]
  formats: ExportFormat[]
  // Extra padding applied uniformly to every variant's viewBox, in px
  // relative to the shorter artboard dimension.
  padding?: number
  // Override for the `original` variant background. Defaults to using
  // artboardBackground (the v1 behavior).
  background?: ExportBackground
}

type BuildArgs = {
  nodes: CanvasNode[]
  stageWidth: number
  stageHeight: number
  brandName: string
  artboardBackground?: string
  selection?: ExportSelection
}

export const DEFAULT_SELECTION: ExportSelection = {
  variants: ['original', 'icon-only', 'wordmark-only', 'mono-dark', 'mono-light'],
  sizes: [512, 1024, 2048],
  formats: ['svg', 'png', 'favicon'],
}

export async function cleanSvg(svg: string): Promise<string> {
  try {
    const { optimize } = await loadSvgo()
    const result = optimize(svg, { multipass: true })
    return result.data
  } catch {
    return svg
  }
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

const VARIANTS: LockupVariant[] = [
  'original',
  'icon-only',
  'wordmark-only',
  'mono-dark',
  'mono-light',
]

const VARIANT_LABELS: Record<LockupVariant, string> = {
  original: 'original',
  'icon-only': 'icon',
  'wordmark-only': 'wordmark',
  'mono-dark': 'mono-black',
  'mono-light': 'mono-white',
}

export async function buildBrandPack({
  nodes,
  stageWidth,
  stageHeight,
  brandName,
  artboardBackground,
  selection = DEFAULT_SELECTION,
}: BuildArgs): Promise<Blob> {
  const { default: JSZip } = await loadJSZip()
  const zip = new JSZip()
  const slug = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo'

  const wantSvg = selection.formats.includes('svg')
  const wantPng = selection.formats.includes('png')
  const wantFavicon = selection.formats.includes('favicon')
  const padding = Math.max(0, selection.padding ?? 0)

  // Folders are lazily created so empty selections don't ship empty dirs.
  let svgFolder: JSZipType | null = null
  let pngFolder: JSZipType | null = null

  const primaryBg = resolveOriginalBackground(selection.background, artboardBackground)
  const primarySvg = await cleanSvg(
    await serializeSvg({
      nodes,
      width: stageWidth,
      height: stageHeight,
      background: primaryBg,
      padding,
    }),
  )

  if (wantSvg || wantPng) {
    for (const variant of VARIANTS) {
      if (!selection.variants.includes(variant)) continue
      const variantNodes = deriveVariant(nodes, variant)
      if (variantNodes.length === 0) continue
      const bg =
        variant === 'mono-light'
          ? '#0a0a0a'
          : variant === 'original'
            ? primaryBg
            : null
      const svg = await cleanSvg(
        await serializeSvg({
          nodes: variantNodes,
          width: stageWidth,
          height: stageHeight,
          background: bg,
          padding,
        }),
      )
      const label = VARIANT_LABELS[variant]
      if (wantSvg) {
        svgFolder ??= zip.folder('svg')!
        svgFolder.file(`${slug}-${label}.svg`, svg)
      }
      if (wantPng && selection.sizes.length > 0) {
        pngFolder ??= zip.folder('png')!
        for (const size of selection.sizes) {
          const blob = await svgToPngBlob(svg, size, size)
          pngFolder.file(`${slug}-${label}-${size}.png`, blob)
        }
      }
    }
  }

  if (wantFavicon) {
    const faviconFolder = zip.folder('favicon')!
    const iconSources: { size: number; data: Uint8Array }[] = []
    for (const size of [16, 32, 48, 180, 192, 512]) {
      const dataUrl = await svgToPngDataUrl(primarySvg, size, size)
      const bytes = await dataUrlToBytes(dataUrl)
      faviconFolder.file(`favicon-${size}.png`, bytes)
      if (size === 16 || size === 32 || size === 48) iconSources.push({ size, data: bytes })
    }
    const ico = encodeIco(iconSources)
    faviconFolder.file('favicon.ico', ico)
  }

  zip.file('README.txt', readmeText(brandName, selection))

  return zip.generateAsync({ type: 'blob' })
}

// Resolves the user's background choice for the `original` variant.
// `transparent` and `custom` are explicit; `artboard` falls back to the
// project's artboardBackground (treating pure white as transparent — same
// as v1).
function resolveOriginalBackground(
  override: ExportBackground | undefined,
  artboardBackground: string | undefined,
): string | null {
  if (!override || override.type === 'artboard') {
    return artboardBackground && artboardBackground !== '#ffffff' ? artboardBackground : null
  }
  if (override.type === 'transparent') return null
  return override.color
}

function readmeText(brandName: string, selection: ExportSelection): string {
  const lines: string[] = [`${brandName} brand pack`, '']
  if (selection.formats.includes('svg')) {
    lines.push('svg/         vector versions (use these for web, print, anywhere)')
  }
  if (selection.formats.includes('png') && selection.sizes.length > 0) {
    const sizeList = selection.sizes.join(' / ')
    lines.push(`png/         raster versions at ${sizeList} px`)
  }
  if (selection.formats.includes('favicon')) {
    lines.push('favicon/     favicon.ico + PNGs for web use')
  }
  lines.push('', 'Generated with Builty.')
  return lines.join('\n')
}
