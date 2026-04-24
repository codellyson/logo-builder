import { useEffect, useState } from 'react'
import { Popover } from '@/ui/popover'
import { oklchToHex, parseColor, type Oklch } from '@/colors/oklch'
import { useCanvasStore } from '@/state/canvas-store'
import { ROLE_LABELS, ROLE_ORDER, type PaletteRole } from '@/colors/palette'
import { cn } from '@/lib/cn'

type Props = {
  value: string | null
  onChange: (hex: string | null) => void
  allowNone?: boolean
  label?: string
}

export function ColorPicker({ value, onChange, allowNone, label }: Props) {
  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-700"
        >
          <Swatch color={value} />
          <span className="font-mono">{value ?? 'none'}</span>
        </button>
      }
      className="w-64 p-3"
    >
      <ColorPickerBody value={value} onChange={onChange} allowNone={allowNone} label={label} />
    </Popover>
  )
}

function ColorPickerBody({ value, onChange, allowNone, label }: Props) {
  const initial = value ? parseColor(value) : null
  const [l, setL] = useState<number>(initial?.l ?? 0.5)
  const [c, setC] = useState<number>(initial?.c ?? 0.15)
  const [h, setH] = useState<number>(initial?.h ?? 250)
  const [hex, setHex] = useState<string>(value ?? '#000000')
  const palette = useCanvasStore((s) => s.palette)

  useEffect(() => {
    const next = oklchToHex({ l, c, h })
    setHex(next)
    onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, c, h])

  const commit = (o: Oklch) => {
    setL(o.l)
    setC(o.c)
    setH(o.h)
  }

  return (
    <div className="flex flex-col gap-3">
      {label && <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>}
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded border border-neutral-800" style={{ background: hex }} />
        <input
          value={hex}
          onChange={(e) => {
            const v = e.target.value
            setHex(v)
            const parsed = parseColor(v)
            if (parsed) {
              setL(parsed.l)
              setC(parsed.c)
              setH(parsed.h)
            }
          }}
          className="flex-1 rounded bg-neutral-900 px-2 py-1.5 font-mono text-xs text-neutral-200 outline-none"
        />
      </div>

      <Slider
        label="L"
        value={l}
        min={0}
        max={1}
        step={0.01}
        onChange={setL}
        gradient={`linear-gradient(to right, oklch(0 ${c} ${h}), oklch(1 ${c} ${h}))`}
      />
      <Slider
        label="C"
        value={c}
        min={0}
        max={0.37}
        step={0.005}
        onChange={setC}
        gradient={`linear-gradient(to right, oklch(${l} 0 ${h}), oklch(${l} 0.37 ${h}))`}
      />
      <Slider
        label="H"
        value={h}
        min={0}
        max={360}
        step={1}
        onChange={setH}
        gradient={`linear-gradient(to right, oklch(${l} ${c} 0), oklch(${l} ${c} 60), oklch(${l} ${c} 120), oklch(${l} ${c} 180), oklch(${l} ${c} 240), oklch(${l} ${c} 300), oklch(${l} ${c} 360))`}
      />

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Palette</div>
        <div className="flex gap-1">
          {ROLE_ORDER.map((role) => {
            const hex = palette[role]
            return (
              <button
                key={role}
                type="button"
                title={ROLE_LABELS[role as PaletteRole]}
                onClick={() => {
                  const parsed = parseColor(hex)
                  if (parsed) commit(parsed)
                }}
                className="h-6 w-6 rounded border border-neutral-800 hover:ring-1 hover:ring-neutral-400"
                style={{ background: hex }}
              />
            )
          })}
        </div>
      </div>

      {allowNone && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          Clear (none)
        </button>
      )}
    </div>
  )
}

function Swatch({ color }: { color: string | null }) {
  if (!color) {
    return (
      <div className="relative h-4 w-4 overflow-hidden rounded-sm border border-neutral-700 bg-neutral-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-[1px] w-5 rotate-45 bg-red-500" />
        </div>
      </div>
    )
  }
  return <div className="h-4 w-4 rounded-sm border border-neutral-700" style={{ background: color }} />
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  gradient,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  gradient: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-[10px] uppercase text-neutral-500">{label}</span>
      <div className="relative flex-1">
        <div
          className="absolute inset-y-1/2 h-2 w-full -translate-y-1/2 rounded-full"
          style={{ background: gradient }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            'relative h-5 w-full cursor-pointer appearance-none bg-transparent',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white',
            '[&::-webkit-slider-thumb]:bg-neutral-950 [&::-webkit-slider-thumb]:shadow',
          )}
        />
      </div>
      <span className="w-10 text-right font-mono text-[10px] text-neutral-400">
        {value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}
      </span>
    </div>
  )
}
