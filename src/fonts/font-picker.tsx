import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { Popover } from '@/ui/popover'
import { BUNDLED_FONTS, CATEGORY_LABELS, type FontCategory } from '@/fonts/registry'
import { loadGoogleFont } from '@/fonts/google-loader'
import { cn } from '@/lib/cn'
import {
  listCustomFonts,
  registerCustomFont,
  unregisterCustomFont,
  type CustomFontInfo,
} from '@/fonts/custom-fonts'
import { AssetImportError, createAsset, deleteAsset } from '@/persistence/assets'

type Props = {
  value: string
  onChange: (family: string) => void
}

export function FontPicker({ value, onChange }: Props) {
  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          className="flex w-full items-center justify-between rounded border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink hover:border-line-strong"
        >
          <span style={{ fontFamily: value }} className="truncate">
            {value}
          </span>
          <Icon icon="lucide:chevron-down" width={12} height={12} className="shrink-0 text-ink-4" />
        </button>
      }
      className="w-72"
    >
      {({ close }) => <FontPickerBody value={value} onChange={onChange} onPick={close} />}
    </Popover>
  )
}

function FontPickerBody({
  value,
  onChange,
  onPick,
}: {
  value: string
  onChange: (family: string) => void
  onPick: () => void
}) {
  const [query, setQuery] = useState('')
  const [customFamily, setCustomFamily] = useState('')
  const [uploaded, setUploaded] = useState<CustomFontInfo[]>(() => listCustomFonts())
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setUploaded(listCustomFonts())
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BUNDLED_FONTS
    return BUNDLED_FONTS.filter((f) => f.family.toLowerCase().includes(q))
  }, [query])

  const filteredCustom = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return uploaded
    return uploaded.filter((f) => f.family.toLowerCase().includes(q))
  }, [query, uploaded])

  const grouped = useMemo(() => {
    const map: Record<FontCategory, typeof BUNDLED_FONTS> = {
      sans: [],
      display: [],
      serif: [],
      mono: [],
    }
    for (const f of filtered) map[f.category].push(f)
    return map
  }, [filtered])

  const handleCustom = async () => {
    const family = customFamily.trim()
    if (!family) return
    await loadGoogleFont(family)
    onChange(family)
    onPick()
  }

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setUploadError(null)
    let firstError: string | null = null
    for (const file of list) {
      try {
        const record = await createAsset(file)
        if (record.kind !== 'font') continue
        await registerCustomFont(record)
      } catch (err) {
        const msg =
          err instanceof AssetImportError
            ? `${file.name}: ${err.message}`
            : `${file.name}: upload failed`
        if (!firstError) firstError = msg
      }
    }
    setUploaded(listCustomFonts())
    setUploading(false)
    if (firstError) setUploadError(firstError)
  }

  const handleDeleteCustom = async (info: CustomFontInfo) => {
    unregisterCustomFont(info.family)
    await deleteAsset(info.record.id)
    setUploaded(listCustomFonts())
  }

  return (
    <div className="flex max-h-96 flex-col">
      <div className="border-b border-line p-2">
        <input
          placeholder="Search fonts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded bg-surface-2 px-2 py-1 text-xs text-ink outline-none"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {filteredCustom.length > 0 && (
          <div className="mb-2">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-4">
              Custom
            </div>
            {filteredCustom.map((f) => (
              <div
                key={f.record.id}
                className={cn(
                  'group flex items-center justify-between rounded px-2 py-1.5',
                  value === f.family ? 'bg-surface-3' : 'hover:bg-surface-2',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(f.family)
                    onPick()
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span style={{ fontFamily: f.family }} className="text-sm text-ink">
                    {f.family}
                  </span>
                  {value === f.family && (
                    <Icon icon="lucide:check" width={12} height={12} className="text-indigo-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteCustom(f)
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Remove custom font"
                >
                  <Icon
                    icon="lucide:trash-2"
                    width={12}
                    height={12}
                    className="text-ink-4 hover:text-red-400"
                  />
                </button>
              </div>
            ))}
          </div>
        )}
        {(['display', 'serif', 'sans', 'mono'] as FontCategory[]).map((cat) => {
          const items = grouped[cat]
          if (items.length === 0) return null
          return (
            <div key={cat} className="mb-2">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-4">
                {CATEGORY_LABELS[cat]}
              </div>
              {items.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.family)
                    onPick()
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-2 py-1.5 text-left',
                    value === f.family ? 'bg-surface-3' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    style={{ fontFamily: f.family, fontWeight: f.weights.includes(700) ? 700 : 400 }}
                    className="text-sm text-ink"
                  >
                    {f.family}
                  </span>
                  {value === f.family && (
                    <Icon icon="lucide:check" width={12} height={12} className="text-indigo-400" />
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <div className="border-t border-line p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-4">
            Add a font
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            <Icon icon="lucide:upload" width={11} height={11} />
            {uploading ? 'Uploading…' : 'Upload .ttf / .otf / .woff'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleUpload(e.target.files)
            e.target.value = ''
          }}
        />
        {uploadError && (
          <div className="mb-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
            {uploadError}
          </div>
        )}
        <div className="flex gap-1">
          <input
            placeholder="Or load Google font (e.g. Poppins)"
            value={customFamily}
            onChange={(e) => setCustomFamily(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustom()
            }}
            className="flex-1 rounded bg-surface-2 px-2 py-1 text-xs text-ink outline-none"
          />
          <button
            type="button"
            onClick={handleCustom}
            className="rounded bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  )
}
