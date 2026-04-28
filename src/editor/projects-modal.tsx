import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
} from '@/persistence/projects'
import { getActiveProjectId } from '@/persistence/active-project'
import {
  activateProject,
  createAndActivateNewProject,
} from '@/state/active-project-actions'
import { serializeSvg } from '@/export/svg-serializer'
import type { ProjectRecord, ProjectSnapshot } from '@/persistence/db'
import { cn } from '@/lib/cn'

type Props = {
  onClose: () => void
  onPickTemplate?: () => void
}

type SortMode = 'recent' | 'name' | 'oldest'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'oldest', label: 'Oldest' },
]

export function ProjectsModal({ onClose, onPickTemplate }: Props) {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(() => getActiveProjectId())
  const [sort, setSort] = useState<SortMode>('recent')

  const refresh = async () => setProjects(await listProjects())

  useEffect(() => {
    refresh()
  }, [])

  const sorted = useMemo(() => {
    const arr = [...projects]
    if (sort === 'recent') arr.sort((a, b) => b.updatedAt - a.updatedAt)
    else if (sort === 'oldest') arr.sort((a, b) => a.updatedAt - b.updatedAt)
    else arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [projects, sort])

  const onOpen = (p: ProjectRecord) => {
    activateProject(p)
    setActiveId(p.id)
    onClose()
  }

  const onNew = async () => {
    await createAndActivateNewProject()
    setActiveId(useCanvasStore.getState().activeProjectId)
    onClose()
  }

  const onDelete = async (id: string) => {
    await deleteProject(id)
    if (activeId === id) {
      useCanvasStore.getState().setActiveProjectId(null)
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
    // If the renamed project is the active one, sync the store mirror so
    // the header chip updates without waiting for a refresh.
    if (id === activeId) {
      useCanvasStore.getState().setActiveProjectName(name.trim() || 'Untitled')
    }
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
          <div className="flex items-center gap-2">
            <SortControl value={sort} onChange={setSort} />
            {onPickTemplate && (
              <button
                type="button"
                onClick={onPickTemplate}
                className="flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-700"
              >
                <Icon icon="lucide:layout-template" width={13} height={13} />
                From template
              </button>
            )}
            <button
              type="button"
              onClick={onNew}
              className="flex items-center gap-1 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
            >
              <Icon icon="lucide:plus" width={13} height={13} />
              New
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Icon icon="lucide:x" width={16} height={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sorted.length === 0 && (
            <div className="py-8 text-center text-xs text-neutral-600">No saved projects yet.</div>
          )}
          {sorted.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={activeId === p.id}
              renaming={renamingId === p.id}
              onOpen={() => onOpen(p)}
              onStartRename={() => setRenamingId(p.id)}
              onCancelRename={() => setRenamingId(null)}
              onCommitRename={(name) => onRename(p.id, name)}
              onDuplicate={() => onDuplicate(p.id)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectRow({
  project,
  active,
  renaming,
  onOpen,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectRecord
  active: boolean
  renaming: boolean
  onOpen: () => void
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded px-2 py-2',
        active ? 'bg-neutral-800/60' : 'hover:bg-neutral-900',
      )}
    >
      <ProjectThumbnail snapshot={project.snapshot} cacheKey={project.updatedAt} />
      {renaming ? (
        <input
          autoFocus
          defaultValue={project.name}
          onBlur={(e) => onCommitRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename(e.currentTarget.value)
            else if (e.key === 'Escape') onCancelRename()
          }}
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none"
        />
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-neutral-100">
            {project.name}
            {active && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-indigo-300">
                active
              </span>
            )}
          </div>
          <div className="text-[10px] text-neutral-500">
            {new Date(project.updatedAt).toLocaleString()} · {project.snapshot.nodes.length}{' '}
            layer{project.snapshot.nodes.length === 1 ? '' : 's'}
          </div>
        </div>
      )}
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionButton icon="lucide:folder-open" title="Open" onClick={onOpen} />
        <ActionButton icon="lucide:pencil" title="Rename" onClick={onStartRename} />
        <ActionButton icon="lucide:copy" title="Duplicate" onClick={onDuplicate} />
        <ActionButton icon="lucide:trash-2" title="Delete" onClick={onDelete} danger />
      </div>
    </div>
  )
}

// Renders a small SVG preview of a project. The serializeSvg call is async
// (text outlining + boolean evaluation), so we render a placeholder until
// it resolves. cacheKey (the project's updatedAt) is in the dep array so
// the preview only re-renders when the project actually changes — opening
// the modal repeatedly with the same data won't re-rasterize.
function ProjectThumbnail({
  snapshot,
  cacheKey,
}: {
  snapshot: ProjectSnapshot
  cacheKey: number
}) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    serializeSvg({
      nodes: snapshot.nodes,
      width: snapshot.stageWidth,
      height: snapshot.stageHeight,
      background: snapshot.artboardBackground,
    })
      .then((s) => {
        if (!cancelled) setSvg(s)
      })
      .catch(() => {
        if (!cancelled) setSvg(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  const cleaned = svg
    ? svg
        .replace(/ width="[^"]+"/, '')
        .replace(/ height="[^"]+"/, '')
        .replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%" ')
    : null

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-neutral-800 bg-neutral-900">
      {cleaned ? (
        <div
          className="flex h-full w-full items-center justify-center p-1"
          dangerouslySetInnerHTML={{ __html: cleaned }}
        />
      ) : (
        <Icon icon="lucide:image" width={14} height={14} className="text-neutral-700" />
      )}
    </div>
  )
}

function SortControl({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (m: SortMode) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortMode)}
      className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none hover:border-neutral-700"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
