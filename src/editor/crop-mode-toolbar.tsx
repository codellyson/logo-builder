import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { cn } from '@/lib/cn'

// Mounts only while toolMode === 'crop-image'. Lets the user pick how the
// crop region is drawn — rect (drag a rotatable box), polygon (click
// anchors), or lasso (drag-trace). Switching modes resets the in-progress
// draft to a fresh empty state for that mode (per IMAGE-CROP-V2).
export function CropModeToolbar() {
  const cropEditState = useCanvasStore((s) => s.cropEditState)
  const setCropMode = useCanvasStore((s) => s.setCropMode)
  const applyCrop = useCanvasStore((s) => s.applyCrop)
  const cancelCrop = useCanvasStore((s) => s.cancelCrop)

  if (!cropEditState) return null
  const mode = cropEditState.mode

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-line bg-surface/95 p-1 shadow-lg backdrop-blur">
      <ModeButton
        icon="lucide:square"
        label="Rect"
        active={mode === 'rect'}
        onClick={() => setCropMode('rect')}
      />
      <ModeButton
        icon="lucide:pentagon"
        label="Polygon"
        active={mode === 'polygon'}
        onClick={() => setCropMode('polygon')}
      />
      <ModeButton
        icon="lucide:spline"
        label="Lasso"
        active={mode === 'lasso'}
        onClick={() => setCropMode('lasso')}
      />
      <div className="mx-1 h-6 w-px bg-surface-3" />
      <button
        type="button"
        onClick={cancelCrop}
        className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-3 hover:text-ink"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={applyCrop}
        className="rounded bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
      >
        Apply
      </button>
    </div>
  )
}

function ModeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-xs',
        active
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'text-ink-3 hover:bg-surface-3 hover:text-ink',
      )}
    >
      <Icon icon={icon} width={13} height={13} />
      <span>{label}</span>
    </button>
  )
}
