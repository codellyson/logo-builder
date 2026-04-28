import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  buildBrandPack,
  cleanSvg,
  DEFAULT_SELECTION,
  type ExportBackground,
  type ExportFormat,
} from '@/export/pipeline'
import { deriveVariant, type LockupVariant } from '@/export/lockups'
import { serializeSvg } from '@/export/svg-serializer'
import { svgToPngBlob, svgToPngDataUrl } from '@/export/raster'
import { encodeIco } from '@/export/ico'
import { cn } from '@/lib/cn'

const QUICK_PNG_SIZES = [256, 512, 1024, 2048]

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl)
  return new Uint8Array(await res.arrayBuffer())
}

type Props = {
  onClose: () => void
}

const PREVIEW_VARIANTS: { value: LockupVariant; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'icon-only', label: 'Icon' },
  { value: 'wordmark-only', label: 'Wordmark' },
  { value: 'mono-dark', label: 'Mono Black' },
  { value: 'mono-light', label: 'Mono White' },
]

// Mirrors pipeline.ts so previews show what the export ZIP will contain.
// `background` overrides the original variant only — mono-light keeps its
// dark background so the white logo stays visible, mono-dark / icon-only /
// wordmark-only stay transparent.
function previewBg(
  variant: LockupVariant,
  artboardBg: string,
  override: ExportBackground,
): string | null {
  if (variant === 'mono-light') return '#0a0a0a'
  if (variant !== 'original') return null
  if (override.type === 'transparent') return null
  if (override.type === 'custom') return override.color
  return artboardBg && artboardBg !== '#ffffff' ? artboardBg : null
}

const ALL_SIZES = [512, 1024, 2048] as const
const ALL_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
  { value: 'favicon', label: 'Favicon' },
]

export function ExportModal({ onClose }: Props) {
  const nodes = useCanvasStore((s) => s.nodes)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const artboardBackground = useCanvasStore((s) => s.artboardBackground)
  const [brandName, setBrandName] = useState('logo')
  const [variants, setVariants] = useState<LockupVariant[]>(() => [...DEFAULT_SELECTION.variants])
  const [sizes, setSizes] = useState<number[]>(() => [...DEFAULT_SELECTION.sizes])
  const [formats, setFormats] = useState<ExportFormat[]>(() => [...DEFAULT_SELECTION.formats])
  const [bgMode, setBgMode] = useState<ExportBackground['type']>('artboard')
  const [bgCustomColor, setBgCustomColor] = useState('#ffffff')
  const [paddingPct, setPaddingPct] = useState(0)
  const [status, setStatus] = useState<'idle' | 'building' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Derive the structured ExportBackground sent to the pipeline.
  const exportBackground = useMemo<ExportBackground>(() => {
    if (bgMode === 'transparent') return { type: 'transparent' }
    if (bgMode === 'custom') return { type: 'custom', color: bgCustomColor }
    return { type: 'artboard' }
  }, [bgMode, bgCustomColor])

  // Padding slider is in % of shorter dim; convert to px for the renderer.
  const paddingPx = useMemo(
    () => Math.round((paddingPct / 100) * Math.min(stageWidth, stageHeight)),
    [paddingPct, stageWidth, stageHeight],
  )

  const summary = useMemo(
    () => describeSelection(variants, sizes, formats),
    [variants, sizes, formats],
  )
  // Disable export when nothing useful would land in the ZIP.
  const nothingToExport =
    formats.length === 0 ||
    (formats.length === 1 && formats[0] === 'favicon' ? false : variants.length === 0) ||
    (formats.includes('png') && sizes.length === 0 && !formats.includes('svg') && !formats.includes('favicon'))

  const toggleInArray = <T,>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]

  // Per-button transient status, used for the "Copied!" / "Downloaded!"
  // confirmation that fades back to idle after a short delay.
  const [quickStatus, setQuickStatus] = useState<Record<string, string>>({})
  const flashStatus = (key: string, msg: string) => {
    setQuickStatus((s) => ({ ...s, [key]: msg }))
    window.setTimeout(() => {
      setQuickStatus((s) => {
        const next = { ...s }
        delete next[key]
        return next
      })
    }, 1800)
  }

  const slug = useMemo(
    () =>
      brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      'logo',
    [brandName],
  )

  const buildOriginalSvg = async (): Promise<string> => {
    const variantNodes = deriveVariant(nodes, 'original')
    const bg =
      exportBackground.type === 'transparent'
        ? null
        : exportBackground.type === 'custom'
          ? exportBackground.color
          : artboardBackground && artboardBackground !== '#ffffff'
            ? artboardBackground
            : null
    return cleanSvg(
      await serializeSvg({
        nodes: variantNodes,
        width: stageWidth,
        height: stageHeight,
        background: bg,
        padding: paddingPx,
      }),
    )
  }

  const onCopySvg = async () => {
    try {
      const svg = await buildOriginalSvg()
      await navigator.clipboard.writeText(svg)
      flashStatus('copy', 'Copied!')
    } catch (err) {
      console.error(err)
      flashStatus('copy', 'Failed')
    }
  }

  const onDownloadPng = async (size: number) => {
    try {
      const svg = await buildOriginalSvg()
      const blob = await svgToPngBlob(svg, size, size)
      downloadBlob(blob, `${slug}-${size}.png`)
      flashStatus('png', 'Downloaded')
    } catch (err) {
      console.error(err)
      flashStatus('png', 'Failed')
    }
  }

  const onDownloadIco = async () => {
    try {
      const svg = await buildOriginalSvg()
      const sources: { size: number; data: Uint8Array }[] = []
      for (const size of [16, 32, 48]) {
        const dataUrl = await svgToPngDataUrl(svg, size, size)
        sources.push({ size, data: await dataUrlToBytes(dataUrl) })
      }
      const ico = encodeIco(sources)
      // encodeIco returns Uint8Array; wrap in a Blob for download.
      downloadBlob(new Blob([ico as BlobPart], { type: 'image/x-icon' }), `${slug}.ico`)
      flashStatus('ico', 'Downloaded')
    } catch (err) {
      console.error(err)
      flashStatus('ico', 'Failed')
    }
  }

  const run = async () => {
    setStatus('building')
    setError(null)
    try {
      const blob = await buildBrandPack({
        nodes,
        stageWidth,
        stageHeight,
        brandName,
        artboardBackground,
        selection: {
          variants,
          sizes,
          formats,
          padding: paddingPx,
          background: exportBackground,
        },
      })
      downloadBlob(blob, `${slug}-brand-pack.zip`)
      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Export brand pack</div>
            <div className="text-xs text-neutral-500">
              SVG + PNG + favicon, as a single ZIP.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Brand slug
              </div>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              />
              <div className="mt-1 text-[10px] text-neutral-600">
                Used for filenames in the ZIP.
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Formats
              </div>
              <div className="flex flex-wrap gap-1">
                {ALL_FORMATS.map((f) => (
                  <Pill
                    key={f.value}
                    active={formats.includes(f.value)}
                    onClick={() => setFormats((prev) => toggleInArray(prev, f.value))}
                  >
                    {f.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                PNG sizes
              </div>
              <div className="flex flex-wrap gap-1">
                {ALL_SIZES.map((s) => (
                  <Pill
                    key={s}
                    active={sizes.includes(s)}
                    disabled={!formats.includes('png')}
                    onClick={() => setSizes((prev) => toggleInArray(prev, s))}
                  >
                    {s}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
                Original background
              </div>
              <div className="flex flex-wrap gap-1">
                <Pill active={bgMode === 'transparent'} onClick={() => setBgMode('transparent')}>
                  Transparent
                </Pill>
                <Pill active={bgMode === 'artboard'} onClick={() => setBgMode('artboard')}>
                  Artboard
                </Pill>
                <Pill active={bgMode === 'custom'} onClick={() => setBgMode('custom')}>
                  Custom
                </Pill>
              </div>
              {bgMode === 'custom' && (
                <input
                  type="color"
                  value={bgCustomColor}
                  onChange={(e) => setBgCustomColor(e.target.value)}
                  className="mt-1 h-6 w-full rounded border border-neutral-800 bg-neutral-900"
                />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
                <span>Padding</span>
                <span className="font-mono normal-case tracking-normal text-neutral-400">
                  {paddingPct}% ({paddingPx}px)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                step={1}
                value={paddingPct}
                onChange={(e) => setPaddingPct(Number(e.target.value))}
                className="w-full accent-indigo-400"
              />
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-neutral-400">
              {summary}
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button
              type="button"
              onClick={run}
              disabled={status === 'building' || nothingToExport}
              className="w-full rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === 'building'
                ? 'Building…'
                : status === 'done'
                  ? 'Exported — export again?'
                  : nothingToExport
                    ? 'Select something to export'
                    : 'Export ZIP'}
            </button>
            <div className="space-y-1.5 border-t border-neutral-800 pt-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                Quick actions
              </div>
              <button
                type="button"
                onClick={onCopySvg}
                className="flex w-full items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-200 hover:border-neutral-700"
              >
                <span className="flex items-center gap-1.5">
                  <Icon icon="lucide:clipboard" width={11} height={11} />
                  Copy SVG to clipboard
                </span>
                {quickStatus.copy && (
                  <span className="text-[10px] text-indigo-300">{quickStatus.copy}</span>
                )}
              </button>
              <div className="rounded border border-neutral-800 bg-neutral-900">
                <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] text-neutral-200">
                  <span className="flex items-center gap-1.5">
                    <Icon icon="lucide:image" width={11} height={11} />
                    Download PNG
                  </span>
                  {quickStatus.png && (
                    <span className="text-[10px] text-indigo-300">{quickStatus.png}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 p-1.5">
                  {QUICK_PNG_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onDownloadPng(size)}
                      className="rounded border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={onDownloadIco}
                className="flex w-full items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-200 hover:border-neutral-700"
              >
                <span className="flex items-center gap-1.5">
                  <Icon icon="lucide:globe" width={11} height={11} />
                  Download favicon.ico
                </span>
                {quickStatus.ico && (
                  <span className="text-[10px] text-indigo-300">{quickStatus.ico}</span>
                )}
              </button>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
              Preview
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PREVIEW_VARIANTS.map((v) => (
                <VariantPreview
                  key={v.value}
                  variant={v.value}
                  label={v.label}
                  selected={variants.includes(v.value)}
                  onToggle={() => setVariants((prev) => toggleInArray(prev, v.value))}
                  nodes={nodes}
                  stageWidth={stageWidth}
                  stageHeight={stageHeight}
                  artboardBackground={artboardBackground}
                  background={exportBackground}
                  padding={paddingPx}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantPreview({
  variant,
  label,
  selected,
  onToggle,
  nodes,
  stageWidth,
  stageHeight,
  artboardBackground,
  background,
  padding,
}: {
  variant: LockupVariant
  label: string
  selected: boolean
  onToggle: () => void
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes']
  stageWidth: number
  stageHeight: number
  artboardBackground: string
  background: ExportBackground
  padding: number
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDataUrl(null)
    setEmpty(false)
    const variantNodes = deriveVariant(nodes, variant)
    if (variantNodes.length === 0) {
      setEmpty(true)
      return
    }
    const bg = previewBg(variant, artboardBackground, background)
    void serializeSvg({
      nodes: variantNodes,
      width: stageWidth,
      height: stageHeight,
      background: bg,
      padding,
    })
      .then((svg) => svgToPngDataUrl(svg, 256, 256))
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setEmpty(true)
      })
    return () => {
      cancelled = true
    }
    // Stringifying nodes is expensive but lets us regenerate previews when
    // the user edits the canvas before exporting. Modal is short-lived, so
    // the cost is bounded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    variant,
    JSON.stringify(nodes),
    stageWidth,
    stageHeight,
    artboardBackground,
    JSON.stringify(background),
    padding,
  ])

  // Mono-dark variant has a black silhouette on transparent background;
  // the modal panel itself is dark, so the preview would be invisible.
  // Force a light tile background for that one specifically.
  const tileBg =
    variant === 'mono-dark'
      ? '#f5f5f5'
      : variant === 'mono-light'
        ? '#0a0a0a'
        : artboardBackground !== '#ffffff'
          ? artboardBackground
          : '#f5f5f5'

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'group block space-y-1 text-left',
        empty && 'cursor-not-allowed opacity-50',
      )}
      disabled={empty}
    >
      <div
        className={cn(
          'relative flex aspect-square items-center justify-center overflow-hidden rounded border-2 transition-colors',
          selected ? 'border-indigo-400' : 'border-neutral-800 group-hover:border-neutral-700',
        )}
        style={{ background: tileBg }}
      >
        {empty ? (
          <span className="px-1 text-center text-[9px] text-neutral-500">
            Nothing to show
          </span>
        ) : dataUrl ? (
          <img src={dataUrl} alt={label} className="h-full w-full object-contain p-2" />
        ) : (
          <Icon
            icon="lucide:loader"
            width={14}
            height={14}
            className="animate-spin text-neutral-600"
          />
        )}
        {!empty && (
          <span
            className={cn(
              'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded border',
              selected
                ? 'border-indigo-400 bg-indigo-500 text-white'
                : 'border-neutral-700 bg-neutral-950/80 text-transparent',
            )}
          >
            <Icon icon="lucide:check" width={10} height={10} />
          </span>
        )}
      </div>
      <div className="truncate text-center text-[10px] text-neutral-400">{label}</div>
    </button>
  )
}

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded border px-2 py-1 text-[11px] transition-colors',
        active
          ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200'
          : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  )
}

function describeSelection(
  variants: LockupVariant[],
  sizes: number[],
  formats: ExportFormat[],
): string {
  const parts: string[] = []
  if (formats.includes('svg') && variants.length > 0) {
    parts.push(`${variants.length} SVG${variants.length === 1 ? '' : 's'}`)
  }
  if (formats.includes('png') && variants.length > 0 && sizes.length > 0) {
    const total = variants.length * sizes.length
    parts.push(`${total} PNG${total === 1 ? '' : 's'}`)
  }
  if (formats.includes('favicon')) {
    parts.push('favicon set')
  }
  if (parts.length === 0) return 'Nothing selected.'
  return `ZIP contents: ${parts.join(', ')}.`
}
