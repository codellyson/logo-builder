import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'

export function ZoomControls() {
  const viewport = useCanvasStore((s) => s.viewport)
  const setViewport = useCanvasStore((s) => s.setViewport)

  const zoom = (factor: number) => {
    const next = Math.max(0.1, Math.min(8, viewport.scale * factor))
    setViewport({ scale: next })
  }

  const fit = () => {
    setViewport({ x: 0, y: 0, scale: 1 })
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-line bg-surface/95 p-1 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => zoom(0.8)}
        className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink"
        title="Zoom out"
      >
        <Icon icon="lucide:minus" width={13} height={13} />
      </button>
      <button
        type="button"
        onClick={fit}
        className="min-w-[52px] rounded px-2 py-1 text-center text-[11px] text-ink-2 hover:bg-surface-3"
        title="Reset view"
      >
        {Math.round(viewport.scale * 100)}%
      </button>
      <button
        type="button"
        onClick={() => zoom(1.25)}
        className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink"
        title="Zoom in"
      >
        <Icon icon="lucide:plus" width={13} height={13} />
      </button>
    </div>
  )
}
