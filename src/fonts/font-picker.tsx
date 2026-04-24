import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Popover } from '@/ui/popover'
import { BUNDLED_FONTS, CATEGORY_LABELS, type FontCategory } from '@/fonts/registry'
import { loadGoogleFont } from '@/fonts/google-loader'
import { cn } from '@/lib/cn'

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
          className="flex w-full items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 hover:border-neutral-700"
        >
          <span style={{ fontFamily: value }} className="truncate">
            {value}
          </span>
          <Icon icon="lucide:chevron-down" width={12} height={12} className="shrink-0 text-neutral-500" />
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BUNDLED_FONTS
    return BUNDLED_FONTS.filter((f) => f.family.toLowerCase().includes(q))
  }, [query])

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

  return (
    <div className="flex max-h-96 flex-col">
      <div className="border-b border-neutral-800 p-2">
        <input
          placeholder="Search fonts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {(['display', 'serif', 'sans', 'mono'] as FontCategory[]).map((cat) => {
          const items = grouped[cat]
          if (items.length === 0) return null
          return (
            <div key={cat} className="mb-2">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
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
                    value === f.family ? 'bg-neutral-800' : 'hover:bg-neutral-900',
                  )}
                >
                  <span
                    style={{ fontFamily: f.family, fontWeight: f.weights.includes(700) ? 700 : 400 }}
                    className="text-sm text-neutral-100"
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
      <div className="border-t border-neutral-800 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
          Custom Google Font
        </div>
        <div className="flex gap-1">
          <input
            placeholder="e.g. Poppins"
            value={customFamily}
            onChange={(e) => setCustomFamily(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustom()
            }}
            className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none"
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
