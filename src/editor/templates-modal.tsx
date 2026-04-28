import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { TEMPLATES, type Template, instantiateTemplate } from '@/templates/registry'
import { createAndActivateFromTemplate } from '@/state/active-project-actions'
import { serializeSvg } from '@/export/svg-serializer'
import { svgToPngDataUrl } from '@/export/raster'

type Props = {
  onClose: () => void
}

export function TemplatesModal({ onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0]?.id ?? '')
  const [brandName, setBrandName] = useState('Brand')
  const [paletteSeed, setPaletteSeed] = useState(TEMPLATES[0]?.paletteSeed ?? '#6366f1')
  const [busy, setBusy] = useState(false)
  const selected = TEMPLATES.find((t) => t.id === selectedId) ?? null

  // Sync palette seed when the user picks a different template — feels
  // less surprising than carrying over the previous template's seed.
  useEffect(() => {
    if (selected) setPaletteSeed(selected.paletteSeed)
  }, [selected])

  const onUse = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await createAndActivateFromTemplate(selected, { brandName, paletteSeed })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium">Start from a template</div>
            <div className="text-xs text-ink-4">
              Pick a starting point and we'll set up a new project for you.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_240px]">
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map((t) => (
              <TemplateTile
                key={t.id}
                template={t}
                brandName={brandName}
                paletteSeed={paletteSeed}
                selected={t.id === selectedId}
                onPick={() => setSelectedId(t.id)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-4">
                Brand name
              </div>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Your brand"
                className="w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-neutral-600"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-4">
                Seed color
              </div>
              <input
                type="color"
                value={paletteSeed}
                onChange={(e) => setPaletteSeed(e.target.value)}
                className="h-8 w-full rounded border border-line bg-surface-2"
              />
              <div className="mt-1 text-[10px] text-ink-4">
                The palette regenerates from this seed.
              </div>
            </div>
            {selected && (
              <div className="rounded border border-line bg-surface-2/50 px-2 py-2 text-[11px] text-ink-3">
                <div className="font-medium text-ink">{selected.name}</div>
                <div className="mt-0.5">{selected.description}</div>
              </div>
            )}
            <button
              type="button"
              onClick={onUse}
              disabled={!selected || busy}
              className="mt-auto rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Use template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TemplateTile({
  template,
  brandName,
  paletteSeed,
  selected,
  onPick,
}: {
  template: Template
  brandName: string
  paletteSeed: string
  selected: boolean
  onPick: () => void
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const snapshot = instantiateTemplate(template, { brandName, paletteSeed })
    serializeSvg({
      nodes: snapshot.nodes,
      width: snapshot.stageWidth,
      height: snapshot.stageHeight,
      background: snapshot.artboardBackground,
    })
      .then((svg) => svgToPngDataUrl(svg, 320, 320))
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [template, brandName, paletteSeed])

  return (
    <button
      type="button"
      onClick={onPick}
      className={`group flex flex-col gap-1 text-left ${selected ? '' : ''}`}
    >
      <div
        className={`flex aspect-square items-center justify-center overflow-hidden rounded border-2 transition-colors ${
          selected ? 'border-indigo-400' : 'border-line group-hover:border-line-strong'
        }`}
        style={{ background: '#ffffff' }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={template.name}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <Icon
            icon="lucide:loader"
            width={14}
            height={14}
            className="animate-spin text-ink-3"
          />
        )}
      </div>
      <div className="truncate text-[11px] text-ink-2">{template.name}</div>
    </button>
  )
}
