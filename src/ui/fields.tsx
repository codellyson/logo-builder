import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-4">{children}</div>
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-neutral-600'

export function NumberField({
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number
  onCommit: (n: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  const [local, setLocal] = useState<string>(String(value))
  useEffect(() => {
    setLocal(String(Math.round(value * 1000) / 1000))
  }, [value])

  const commit = () => {
    let n = Number(local)
    if (!Number.isFinite(n)) {
      setLocal(String(value))
      return
    }
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    onCommit(n)
  }

  return (
    <div className="relative">
      <input
        type="number"
        step={step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setLocal(String(value))
        }}
        className={cn(inputCls, suffix && 'pr-6')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-4">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function TextField({
  value,
  onCommit,
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <input
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setLocal(value)
      }}
      className={inputCls}
    />
  )
}

export function TextAreaField({
  value,
  onCommit,
}: {
  value: string
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      rows={2}
      className={cn(inputCls, 'resize-y')}
    />
  )
}

export function Slider01({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-8 text-right font-mono text-[10px] text-ink-3">
        {Math.round(value * 100)}
      </span>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded px-2 py-1 text-center text-[11px]',
            value === o.value ? 'bg-neutral-700 text-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
