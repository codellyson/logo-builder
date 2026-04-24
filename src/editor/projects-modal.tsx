import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  saveAsProject,
  updateProject,
} from '@/persistence/projects'
import type { ProjectRecord } from '@/persistence/db'
import { cn } from '@/lib/cn'

type Props = {
  onClose: () => void
}

const ACTIVE_KEY = 'logo-builder:active-project'

export function ProjectsModal({ onClose }: Props) {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [saveName, setSaveName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null,
  )

  const refresh = async () => setProjects(await listProjects())

  useEffect(() => {
    refresh()
  }, [])

  const currentSnapshot = () => {
    const s = useCanvasStore.getState()
    return {
      nodes: s.nodes,
      stageWidth: s.stageWidth,
      stageHeight: s.stageHeight,
      palette: s.palette,
    }
  }

  const onSaveNew = async () => {
    const rec = await saveAsProject(saveName || 'Untitled', currentSnapshot())
    setSaveName('')
    localStorage.setItem(ACTIVE_KEY, rec.id)
    setActiveId(rec.id)
    refresh()
  }

  const onSaveTo = async (id: string) => {
    await updateProject(id, currentSnapshot())
    localStorage.setItem(ACTIVE_KEY, id)
    setActiveId(id)
    refresh()
  }

  const onOpen = async (p: ProjectRecord) => {
    useCanvasStore.getState().replaceState({
      nodes: p.snapshot.nodes,
      stageWidth: p.snapshot.stageWidth,
      stageHeight: p.snapshot.stageHeight,
      palette: p.snapshot.palette,
    })
    useCanvasStore.temporal.getState().clear()
    localStorage.setItem(ACTIVE_KEY, p.id)
    setActiveId(p.id)
    onClose()
  }

  const onDelete = async (id: string) => {
    await deleteProject(id)
    if (activeId === id) {
      localStorage.removeItem(ACTIVE_KEY)
      setActiveId(null)
    }
    refresh()
  }

  const onDuplicate = async (id: string) => {
    await duplicateProject(id)
    refresh()
  }

  const onRename = async (id: string, name: string) => {
    await renameProject(id, name)
    setRenamingId(null)
    refresh()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Projects</div>
            <div className="text-xs text-neutral-500">Stored locally in your browser.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>

        <div className="border-b border-neutral-800 p-4">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Save current canvas as new project
          </div>
          <div className="flex gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Project name"
              className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
            <button
              type="button"
              onClick={onSaveNew}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
            >
              Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {projects.length === 0 && (
            <div className="py-8 text-center text-xs text-neutral-600">No saved projects yet.</div>
          )}
          {projects.map((p) => {
            const active = activeId === p.id
            return (
              <div
                key={p.id}
                className={cn(
                  'group flex items-center gap-2 rounded px-2 py-2',
                  active ? 'bg-neutral-800/60' : 'hover:bg-neutral-900',
                )}
              >
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.name}
                    onBlur={(e) => onRename(p.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onRename(p.id, e.currentTarget.value)
                      else if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none"
                  />
                ) : (
                  <div className="flex-1">
                    <div className="text-sm text-neutral-100">
                      {p.name}
                      {active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-indigo-300">
                          active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {new Date(p.updatedAt).toLocaleString()} · {p.snapshot.nodes.length} layer
                      {p.snapshot.nodes.length === 1 ? '' : 's'}
                    </div>
                  </div>
                )}
                <div className="flex gap-1">
                  <ActionButton icon="lucide:folder-open" title="Open" onClick={() => onOpen(p)} />
                  <ActionButton
                    icon="lucide:save"
                    title="Save current canvas to this project"
                    onClick={() => onSaveTo(p.id)}
                  />
                  <ActionButton
                    icon="lucide:pencil"
                    title="Rename"
                    onClick={() => setRenamingId(p.id)}
                  />
                  <ActionButton
                    icon="lucide:copy"
                    title="Duplicate"
                    onClick={() => onDuplicate(p.id)}
                  />
                  <ActionButton
                    icon="lucide:trash-2"
                    title="Delete"
                    onClick={() => onDelete(p.id)}
                    danger
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: string
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800',
        danger ? 'hover:text-red-400' : 'hover:text-neutral-100',
      )}
    >
      <Icon icon={icon} width={13} height={13} />
    </button>
  )
}
