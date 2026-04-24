import JSZip from 'jszip'
import { optimize } from 'svgo'
import { serializeSvg } from '@/export/svg-serializer'
import { svgToPngBlob, svgToPngDataUrl } from '@/export/raster'
import { encodeIco } from '@/export/ico'
import { deriveVariant, type LockupVariant } from '@/export/lockups'
import type { CanvasNode } from '@/canvas/types'

type BuildArgs = {
  nodes: CanvasNode[]
  stageWidth: number
  stageHeight: number
  brandName: string
  artboardBackground?: string
}

async function cleanSvg(svg: string): Promise<string> {
  try {
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
}: BuildArgs): Promise<Blob> {
  const zip = new JSZip()
  const slug = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo'

  const svgFolder = zip.folder('svg')!
  const pngFolder = zip.folder('png')!

  const primaryBg = artboardBackground && artboardBackground !== '#ffffff' ? artboardBackground : null
  const primarySvg = await cleanSvg(
    await serializeSvg({ nodes, width: stageWidth, height: stageHeight, background: primaryBg }),
  )

  for (const variant of VARIANTS) {
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
      }),
    )
    const label = VARIANT_LABELS[variant]
    svgFolder.file(`${slug}-${label}.svg`, svg)
    for (const size of [512, 1024, 2048]) {
      const blob = await svgToPngBlob(svg, size, size)
      pngFolder.file(`${slug}-${label}-${size}.png`, blob)
    }
  }

  // Favicons from the primary variant
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

  zip.file(
    'README.txt',
    `${brandName} brand pack\n\nsvg/         vector versions (use these for web, print, anywhere)\npng/         raster versions at 512 / 1024 / 2048 px\nfavicon/     favicon.ico + PNGs for web use\n\nGenerated with Logo Builder.`,
  )

  return zip.generateAsync({ type: 'blob' })
}
