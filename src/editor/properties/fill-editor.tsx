import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { ColorStop, Fill, LinearFill, RadialFill } from '@/canvas/types'
import { ColorPicker } from '@/colors/color-picker'
import {
  colorAtOffset,
  convertFill,
  fillKind,
  fillSolidColor,
  reverseStops,
  solidFill,
  splitColorOpacity,
  withAlpha,
  type FillKind,
} from '@/composition/fills'
import { StopBar } from '@/editor/properties/stop-bar'
import { NumberField, Segmented } from '@/ui/fields'

type Props = {
  value: Fill | null
  onChange: (next: Fill | null) => void
  // Local-frame bbox of the node being edited. Used to seed gradient
  // endpoints that fit the shape on first conversion. For centered shapes
  // (ellipse/polygon/star) the origin is negative, so endpoints land at the
  // shape's edges rather than at its center.
  bbox: { x: number; y: number; width: number; height: number }
  allowNone?: boolean
}

export function FillEditor({ value, onChange, bbox, allowNone }: Props) {
  const kind = fillKind(value)

  const options: { value: FillKind; label: string }[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
  ]
  if (allowNone) options.unshift({ value: 'none', label: 'None' })

  return (
    <div className="space-y-2">
      <Segmented<FillKind>
        value={kind}
        options={options}
        onChange={(next) => {
          if (next === kind) return
          onChange(convertFill(value, next, bbox))
        }}
      />
      {kind === 'solid' && value?.type === 'solid' && (
        <ColorPicker
          value={value.color}
          onChange={(hex) => hex && onChange(solidFill(hex))}
        />
      )}
      {kind === 'linear' && value?.type === 'linear' && (
        <GradientStopList
          fill={value}
          onChange={onChange}
        />
      )}
      {kind === 'radial' && value?.type === 'radial' && (
        <GradientStopList
          fill={value}
          onChange={onChange}
        />
      )}
      {kind === 'none' && (
        <div className="text-[10px] text-neutral-600">No fill.</div>
      )}
    </div>
  )
}

function GradientStopList({
  fill,
  onChange,
}: {
  fill: LinearFill | RadialFill
  onChange: (next: Fill | null) => void
}) {
  // Tracks which stop the user is currently editing. Clamped to a valid index
  // when stops are added/removed so the editor row never points at nothing.
  const [selectedIndex, setSelectedIndex] = useState(0)
  const safeIndex = Math.min(selectedIndex, fill.stops.length - 1)
  const selected = fill.stops[safeIndex]

  const updateStop = (i: number, patch: Partial<ColorStop>) => {
    const next = fill.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    onChange({ ...fill, stops: next })
  }

  const removeStop = (i: number) => {
    if (fill.stops.length <= 2) return
    onChange({ ...fill, stops: fill.stops.filter((_, idx) => idx !== i) })
    // After removal, indices shift — clamp selection.
    if (i <= selectedIndex) setSelectedIndex(Math.max(0, selectedIndex - 1))
  }

  const addStopAt = (offset: number) => {
    const color = colorAtOffset(fill.stops, offset)
    const next = [...fill.stops, { offset, color }]
    onChange({ ...fill, stops: next })
    setSelectedIndex(next.length - 1)
  }

  const addStopHalfway = () => {
    if (fill.stops.length === 0) return
    const sorted = [...fill.stops].sort((a, b) => a.offset - b.offset)
    const last = sorted[sorted.length - 1]
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : { offset: 0, color: last.color }
    addStopAt((prev.offset + last.offset) / 2)
  }

  const reverse = () => {
    onChange({ ...fill, stops: reverseStops(fill.stops) })
  }

  return (
    <div className="space-y-3">
      <StopBar
        stops={fill.stops}
        selectedIndex={safeIndex}
        onSelect={setSelectedIndex}
        onChangeStop={updateStop}
        onAddStop={addStopAt}
        onRemoveStop={removeStop}
      />

      {selected && (
        <StopRow
          stop={selected}
          onChange={(patch) => updateStop(safeIndex, patch)}
          onRemove={() => removeStop(safeIndex)}
          removable={fill.stops.length > 2}
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reverse}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <Icon icon="lucide:arrow-left-right" width={12} height={12} />
          Reverse
        </button>
        <button
          type="button"
          onClick={addStopHalfway}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-neutral-700 bg-neutral-900/50 px-2 py-1 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
        >
          <Icon icon="lucide:plus" width={12} height={12} />
          Add stop
        </button>
      </div>
    </div>
  )
}

function StopRow({
  stop,
  onChange,
  onRemove,
  removable,
}: {
  stop: ColorStop
  onChange: (patch: Partial<ColorStop>) => void
  onRemove: () => void
  removable: boolean
}) {
  const { color, opacity } = splitColorOpacity(stop.color)
  return (
    <div className="flex items-center gap-1">
      <ColorPicker
        value={color}
        onChange={(hex) => hex && onChange({ color: withAlpha(hex, opacity) })}
      />
      <div className="w-14 shrink-0">
        <NumberField
          value={stop.offset}
          step={0.01}
          min={0}
          max={1}
          onCommit={(n) => onChange({ offset: Math.max(0, Math.min(1, n)) })}
        />
      </div>
      <div className="w-14 shrink-0">
        <NumberField
          value={Math.round(opacity * 100)}
          step={1}
          min={0}
          max={100}
          suffix="%"
          onCommit={(n) => onChange({ color: withAlpha(color, n / 100) })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!removable}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-30"
        title="Remove stop"
      >
        <Icon icon="lucide:trash-2" width={12} height={12} />
      </button>
    </div>
  )
}

// Re-export helpers commonly needed alongside FillEditor.
export { fillSolidColor }
