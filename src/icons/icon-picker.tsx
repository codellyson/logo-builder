import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Popover } from '@/ui/popover'
import { ICON_SETS, ICON_SET_PREFIXES } from '@/icons/registry'
import { searchIcons } from '@/icons/icon-svg'
import { cn } from '@/lib/cn'

type Props = {
  value: string | null
  onChange: (iconName: string) => void
  triggerLabel?: string
}

export function IconPicker({ value, onChange, triggerLabel = 'Pick icon' }: Props) {
  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-700"
        >
          {value ? <Icon icon={value} width={14} height={14} /> : <Icon icon="lucide:shapes" width={14} height={14} />}
          <span className="font-mono">{value ?? triggerLabel}</span>
        </button>
      }
      className="w-80"
    >
      {({ close }) => <IconPickerBody value={value} onChange={onChange} onPick={close} />}
    </Popover>
  )
}

function IconPickerBody({
  value,
  onChange,
  onPick,
}: {
  value: string | null
  onChange: (iconName: string) => void
  onPick: () => void
}) {
  const [query, setQuery] = useState('')
  const [activePrefixes, setActivePrefixes] = useState<string[]>(ICON_SET_PREFIXES)
  const [results, setResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      searchIcons(query, activePrefixes)
        .then((res) => {
          if (!cancelled) setResults(res.icons)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, activePrefixes])

  const togglePrefix = (prefix: string) => {
    setActivePrefixes((current) =>
      current.includes(prefix) ? current.filter((p) => p !== prefix) : [...current, prefix],
    )
  }

  const empty = useMemo(() => !loading && query.trim() && results.length === 0, [loading, query, results])

  return (
    <div className="flex max-h-[28rem] flex-col">
      <div className="border-b border-neutral-800 p-2">
        <input
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none"
          autoFocus
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {ICON_SETS.map((s) => {
            const on = activePrefixes.includes(s.prefix)
            return (
              <button
                key={s.prefix}
                type="button"
                onClick={() => togglePrefix(s.prefix)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px]',
                  on
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                    : 'border-neutral-800 text-neutral-500 hover:border-neutral-700',
                )}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto p-2">
        {!query.trim() && (
          <div className="py-6 text-center text-xs text-neutral-600">
            Search to browse {activePrefixes.length} set{activePrefixes.length === 1 ? '' : 's'}.
          </div>
        )}
        {loading && <div className="py-6 text-center text-xs text-neutral-600">Searching…</div>}
        {empty && <div className="py-6 text-center text-xs text-neutral-600">No icons found.</div>}
        {results.length > 0 && (
          <div className="grid grid-cols-6 gap-1">
            {results.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onChange(name)
                  onPick()
                }}
                className={cn(
                  'flex aspect-square items-center justify-center rounded border',
                  value === name
                    ? 'border-indigo-400 bg-indigo-500/10'
                    : 'border-neutral-800 hover:border-neutral-600',
                )}
              >
                <Icon icon={name} width={22} height={22} className="text-neutral-200" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
