import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  createAndActivateFromIdanFile,
  createAndActivateNewProject,
  deleteActiveProject,
  duplicateActiveProject,
  renameActiveProject,
} from '@/state/active-project-actions'
import { snapshotFromStore } from '@/state/autosave'
import { Popover } from '@/ui/popover'
import { useStore } from 'zustand'
import { cn } from '@/lib/cn'

// Lazy: the export dialog statically imports the literal-builder, which
// in turn pulls a JSON.stringify of the entire canvas state — fine on
// click, wasteful at boot.
const TemplateExportDialog = lazy(() =>
  import('@/editor/template-export-dialog').then((m) => ({
    default: m.TemplateExportDialog,
  })),
)

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
        <ActiveProjectChip onOpenAll={onOpenProjects} />
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

// Active project surface: shows the project name with a chevron. Click →
// dropdown menu (Rename / Duplicate / New project / All projects... /
// Delete). The menu's "Rename" item swaps the chip into an inline input.
function ActiveProjectChip({ onOpenAll }: { onOpenAll?: () => void }) {
  const name = useCanvasStore((s) => s.activeProjectName)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(name)
  const [exportingTemplate, setExportingTemplate] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleSaveToFile = async () => {
    const { downloadIdanFile } = await import('@/persistence/idan-file')
    downloadIdanFile(name, snapshotFromStore())
  }

  const handleOpenFromFile = async (file: File) => {
    setImportError(null)
    try {
      await createAndActivateFromIdanFile(file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to open file.')
    }
  }

  // Reset the draft whenever the upstream name changes (e.g. project switch
  // through the modal) so the input doesn't show stale text on next open.
  useEffect(() => {
    if (!renaming) setDraft(name)
  }, [name, renaming])

  const commitRename = async () => {
    const next = draft.trim() || 'Untitled'
    if (next !== name) await renameActiveProject(next)
    setRenaming(false)
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRename()
          else if (e.key === 'Escape') {
            setDraft(name)
            setRenaming(false)
          }
        }}
        className="ml-2 w-44 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500"
      />
    )
  }

  return (
    <>
    <Popover
      align="start"
      trigger={
        <button
          type="button"
          className="ml-2 flex max-w-[14rem] items-center gap-1 rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
          title={name}
        >
          <span className="truncate">{name}</span>
          <Icon icon="lucide:chevron-down" width={11} height={11} />
        </button>
      }
      className="w-48 p-1"
    >
      {({ close }) => (
        <>
          <MenuItem
            icon="lucide:pencil"
            label="Rename"
            onClick={() => {
              setDraft(name)
              setRenaming(true)
              close()
            }}
          />
          <MenuItem
            icon="lucide:copy"
            label="Duplicate"
            onClick={async () => {
              await duplicateActiveProject()
              close()
            }}
          />
          <MenuItem
            icon="lucide:plus"
            label="New project"
            onClick={async () => {
              await createAndActivateNewProject()
              close()
            }}
          />
          <MenuItem
            icon="lucide:folder-open"
            label="All projects…"
            onClick={() => {
              close()
              onOpenAll?.()
            }}
          />
          <MenuItem
            icon="lucide:layout-template"
            label="Export as template…"
            onClick={() => {
              close()
              setExportingTemplate(true)
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="lucide:download"
            label="Save to file…"
            onClick={async () => {
              close()
              await handleSaveToFile()
            }}
          />
          <MenuItem
            icon="lucide:upload"
            label="Open file…"
            onClick={() => {
              close()
              fileInputRef.current?.click()
            }}
          />
          <MenuDivider />
          <MenuItem
            icon="lucide:trash-2"
            label="Delete"
            danger
            onClick={async () => {
              const ok = window.confirm(`Delete "${name}"? This can't be undone.`)
              if (!ok) {
                close()
                return
              }
              await deleteActiveProject()
              close()
            }}
          />
        </>
      )}
    </Popover>
      {exportingTemplate && (
        <Suspense fallback={null}>
          <TemplateExportDialog onClose={() => setExportingTemplate(false)} />
        </Suspense>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".idan,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          // Reset the input so picking the same file twice in a row still
          // fires onChange (browsers gate by value-equality).
          e.target.value = ''
          if (f) await handleOpenFromFile(f)
        }}
      />
      {importError && (
        <div
          role="alert"
          className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 shadow-lg"
          onClick={() => setImportError(null)}
        >
          {importError}
        </div>
      )}
    </>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs',
        danger
          ? 'text-neutral-400 hover:bg-red-500/10 hover:text-red-300'
          : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100',
      )}
    >
      <Icon icon={icon} width={13} height={13} />
      <span>{label}</span>
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 border-t border-neutral-800" />
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
