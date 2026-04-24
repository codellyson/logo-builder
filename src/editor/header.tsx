import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { useStore } from 'zustand'
import { cn } from '@/lib/cn'

type HeaderProps = {
  onOpenExport?: () => void
  onOpenProjects?: () => void
  canExport?: boolean
}

export function EditorHeader({ onOpenExport, onOpenProjects, canExport }: HeaderProps) {
  const pastStates = useStore(useCanvasStore.temporal, (s) => s.pastStates)
  const futureStates = useStore(useCanvasStore.temporal, (s) => s.futureStates)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 rounded-sm bg-gradient-to-br from-fuchsia-500 to-indigo-500" />
        <span className="text-sm font-medium tracking-tight">Logo Builder</span>
        {onOpenProjects && (
          <button
            type="button"
            onClick={onOpenProjects}
            className="ml-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon icon="lucide:folder-open" width={13} height={13} />
            <span>Projects</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <HeaderButton
          icon="lucide:undo-2"
          title="Undo"
          disabled={!canUndo}
          onClick={() => useCanvasStore.temporal.getState().undo()}
        />
        <HeaderButton
          icon="lucide:redo-2"
          title="Redo"
          disabled={!canRedo}
          onClick={() => useCanvasStore.temporal.getState().redo()}
        />
      </div>

      <button
        type="button"
        onClick={onOpenExport}
        disabled={!canExport}
        className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Export
      </button>
    </header>
  )
}

function HeaderButton({
  icon,
  title,
  disabled,
  onClick,
}: {
  icon: string
  title: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-neutral-400',
        'hover:bg-neutral-800 hover:text-neutral-100',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400',
      )}
    >
      <Icon icon={icon} width={15} height={15} />
    </button>
  )
}
