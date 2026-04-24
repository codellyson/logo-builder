import { Icon } from '@iconify/react'
import { useCanvasStore, type AlignEdge, type DistributeAxis } from '@/state/canvas-store'
import { cn } from '@/lib/cn'

const ALIGN_ITEMS: { edge: AlignEdge; icon: string; label: string }[] = [
  { edge: 'left', icon: 'lucide:align-start-horizontal', label: 'Left' },
  { edge: 'hcenter', icon: 'lucide:align-center-horizontal', label: 'Center (H)' },
  { edge: 'right', icon: 'lucide:align-end-horizontal', label: 'Right' },
  { edge: 'top', icon: 'lucide:align-start-vertical', label: 'Top' },
  { edge: 'vcenter', icon: 'lucide:align-center-vertical', label: 'Middle (V)' },
  { edge: 'bottom', icon: 'lucide:align-end-vertical', label: 'Bottom' },
]

const DISTRIBUTE_ITEMS: { axis: DistributeAxis; icon: string; title: string }[] = [
  { axis: 'h', icon: 'lucide:align-horizontal-distribute-center', title: 'Distribute Horizontally' },
  { axis: 'v', icon: 'lucide:align-vertical-distribute-center', title: 'Distribute Vertically' },
]

export function AlignToolbar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const alignSelection = useCanvasStore((s) => s.alignSelection)
  const distributeSelection = useCanvasStore((s) => s.distributeSelection)
  // Align buttons work with >=1 (artboard mode via Shift) or >=2 (selection mode).
  const canAlign = selectedIds.length >= 1
  const canDistribute = selectedIds.length >= 3

  return (
    <div className="pointer-events-auto flex gap-1 rounded-md border border-neutral-800 bg-neutral-950/95 p-1 shadow-lg backdrop-blur">
      {ALIGN_ITEMS.map((it) => (
        <button
          key={it.edge}
          type="button"
          title={`Align ${it.label} (Shift: to artboard)`}
          disabled={!canAlign}
          onClick={(e) => {
            const toArtboard = e.shiftKey || selectedIds.length < 2
            alignSelection(it.edge, toArtboard)
          }}
          className={toolClass()}
        >
          <Icon icon={it.icon} width={15} height={15} />
        </button>
      ))}
      <div className="mx-0.5 w-px bg-neutral-800" />
      {DISTRIBUTE_ITEMS.map((it) => (
        <button
          key={it.axis}
          type="button"
          title={it.title}
          disabled={!canDistribute}
          onClick={() => distributeSelection(it.axis)}
          className={toolClass()}
        >
          <Icon icon={it.icon} width={15} height={15} />
        </button>
      ))}
    </div>
  )
}

function toolClass() {
  return cn(
    'flex h-8 w-8 items-center justify-center rounded text-neutral-400',
    'hover:bg-neutral-800 hover:text-neutral-100',
    'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400',
  )
}
