import { useEffect, useRef, useState } from 'react'
import type { ColorStop } from '@/canvas/types'

type Props = {
  stops: ColorStop[]
  selectedIndex: number
  onSelect: (index: number) => void
  onChangeStop: (index: number, patch: Partial<ColorStop>) => void
  onAddStop: (offset: number) => void
  onRemoveStop: (index: number) => void
}

// A horizontal gradient ramp with draggable markers at each stop's offset.
// Click the bar between markers to insert a new stop with an interpolated
// color. Click a marker to select it. Drag to change offset. Alt-click to
// delete (only when there are >2 stops). Stops re-order naturally as their
// offsets cross — no special swap logic.
export function StopBar({
  stops,
  selectedIndex,
  onSelect,
  onChangeStop,
  onAddStop,
  onRemoveStop,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null)

  // Sorted view for the visual bar — but indices map back to the original
  // unsorted array so callers can mutate the same stop they think they're
  // editing.
  const indexed = stops.map((s, i) => ({ stop: s, originalIndex: i }))
  indexed.sort((a, b) => a.stop.offset - b.stop.offset)

  const css = `linear-gradient(to right, ${indexed
    .map((it) => `${it.stop.color} ${(it.stop.offset * 100).toFixed(2)}%`)
    .join(', ')})`

  const offsetFromClient = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  return (
    <div className="space-y-1">
      <div
        ref={barRef}
        className="relative h-6 cursor-copy overflow-visible rounded border border-line-strong"
        style={{ background: css }}
        onMouseDown={(e) => {
          // Markers stop propagation, so this only fires for bar-bg clicks.
          // Add a new stop at the click offset.
          const offset = offsetFromClient(e.clientX)
          onAddStop(offset)
        }}
      >
        {indexed.map(({ stop, originalIndex }) => (
          <Marker
            key={originalIndex}
            stop={stop}
            selected={originalIndex === selectedIndex}
            canDelete={stops.length > 2}
            onSelect={() => onSelect(originalIndex)}
            onDragMove={(offset) => onChangeStop(originalIndex, { offset })}
            onAltClick={() => onRemoveStop(originalIndex)}
            offsetFromClient={offsetFromClient}
          />
        ))}
      </div>
      <div className="text-[10px] text-ink-4">
        Click bar to add · Alt-click marker to delete
      </div>
    </div>
  )
}

function Marker({
  stop,
  selected,
  canDelete,
  onSelect,
  onDragMove,
  onAltClick,
  offsetFromClient,
}: {
  stop: ColorStop
  selected: boolean
  canDelete: boolean
  onSelect: () => void
  onDragMove: (offset: number) => void
  onAltClick: () => void
  offsetFromClient: (clientX: number) => number
}) {
  const [active, setActive] = useState(false)

  // Clean up document listeners if the component unmounts mid-drag.
  useEffect(() => {
    if (!active) return
    return () => setActive(false)
  }, [active])

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.altKey) {
      if (canDelete) onAltClick()
      return
    }
    onSelect()
    setActive(true)
    const onMove = (ev: PointerEvent) => {
      onDragMove(offsetFromClient(ev.clientX))
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setActive(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      style={{ left: `${stop.offset * 100}%` }}
      className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 ${
        selected ? 'border-indigo-400' : 'border-white'
      } shadow ${active ? 'cursor-grabbing' : ''}`}
    >
      <div
        className="h-full w-full rounded-full"
        style={{ background: stop.color }}
      />
    </div>
  )
}
