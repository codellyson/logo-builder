import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { ColorPicker } from '@/colors/color-picker'
import { solidFill } from '@/composition/fills'
import { ROLE_LABELS, ROLE_ORDER, generatePalette, type Palette, type PaletteRole } from '@/colors/palette'
import {
  deletePalette,
  listPalettes,
  renamePalette,
  savePalette,
} from '@/persistence/palettes'
import type { PaletteRecord } from '@/persistence/db'
import { cn } from '@/lib/cn'

export function PalettePanel() {
  const palette = useCanvasStore((s) => s.palette)
  const setPaletteSeed = useCanvasStore((s) => s.setPaletteSeed)
  const setPalette = useCanvasStore((s) => s.setPalette)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const updateNode = useCanvasStore((s) => s.updateNode)
  const nodes = useCanvasStore((s) => s.nodes)
  const [seedOpen, setSeedOpen] = useState(true)

  const applyRoleToSelection = (role: PaletteRole) => {
    const hex = palette[role]
    for (const id of selectedIds) {
      const n = nodes.find((x) => x.id === id)
      if (!n) continue
      if (n.type === 'line') updateNode(id, { stroke: solidFill(hex) })
      else if ('fill' in n) updateNode(id, { fill: solidFill(hex) })
    }
  }

  return (
    <div className="border-t border-neutral-800">
      <button
        type="button"
        onClick={() => setSeedOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
      >
        <span>Palette</span>
        <Icon icon={seedOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'} width={12} height={12} />
      </button>
      {seedOpen && (
        <div className="space-y-3 px-3 pb-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              Seed
            </div>
            <ColorPicker
              value={palette.seed}
              onChange={(hex) => {
                if (hex) setPaletteSeed(hex)
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              Roles <span className="text-neutral-600">(click to apply)</span>
            </div>
            <div className="space-y-1">
              {ROLE_ORDER.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyRoleToSelection(role)}
                    className="h-6 w-6 shrink-0 rounded border border-neutral-800 hover:ring-1 hover:ring-neutral-400"
                    style={{ background: palette[role] }}
                    title={`Apply ${ROLE_LABELS[role]} to selection`}
                  />
                  <span className="flex-1 text-xs text-neutral-300">{ROLE_LABELS[role]}</span>
                  <ColorPicker
                    value={palette[role]}
                    onChange={(hex) => {
                      if (hex) setPalette({ ...palette, [role]: hex })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPalette(generatePalette(palette.seed))}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Regenerate from seed
          </button>
          <PaletteLibrary palette={palette} onLoad={setPalette} />
        </div>
      )}
    </div>
  )
}

function PaletteLibrary({
  palette,
  onLoad,
}: {
  palette: Palette
  onLoad: (p: Palette) => void
}) {
  const [saved, setSaved] = useState<PaletteRecord[]>([])
  const [savingName, setSavingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const refresh = async () => setSaved(await listPalettes())
  useEffect(() => {
    refresh()
  }, [])

  const onSaveCommit = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      setSavingName(null)
      return
    }
    await savePalette(trimmed, palette)
    setSavingName(null)
    refresh()
  }

  const onRenameCommit = async (id: string, name: string) => {
    await renamePalette(id, name)
    setRenamingId(null)
    refresh()
  }

  const onDelete = async (id: string) => {
    await deletePalette(id)
    refresh()
  }

  return (
    <div className="border-t border-neutral-800 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Library
        </span>
        <button
          type="button"
          onClick={() => setSavingName(palette.seed)}
          className="text-[11px] text-indigo-400 hover:text-indigo-300"
        >
          + Save current
        </button>
      </div>
      {savingName !== null && (
        <input
          autoFocus
          defaultValue={savingName}
          placeholder="Name this palette"
          onBlur={(e) => onSaveCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveCommit(e.currentTarget.value)
            else if (e.key === 'Escape') setSavingName(null)
          }}
          className="mb-2 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 outline-none"
        />
      )}
      {saved.length === 0 && savingName === null && (
        <div className="px-1 py-2 text-[10px] text-neutral-600">
          Save the current palette to reuse it across projects.
        </div>
      )}
      <div className="space-y-1">
        {saved.map((p) => (
          <SavedPaletteRow
            key={p.id}
            record={p}
            renaming={renamingId === p.id}
            onLoad={() => onLoad(p.palette)}
            onStartRename={() => setRenamingId(p.id)}
            onCancelRename={() => setRenamingId(null)}
            onCommitRename={(name) => onRenameCommit(p.id, name)}
            onDelete={() => onDelete(p.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SavedPaletteRow({
  record,
  renaming,
  onLoad,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDelete,
}: {
  record: PaletteRecord
  renaming: boolean
  onLoad: () => void
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: (name: string) => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-neutral-900">
      <button
        type="button"
        onClick={onLoad}
        title="Load palette"
        className="flex shrink-0 overflow-hidden rounded border border-neutral-800"
      >
        {ROLE_ORDER.map((role) => (
          <span
            key={role}
            className="block h-5 w-3"
            style={{ background: record.palette[role] }}
          />
        ))}
      </button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={record.name}
          onBlur={(e) => onCommitRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename(e.currentTarget.value)
            else if (e.key === 'Escape') onCancelRename()
          }}
          className="flex-1 rounded bg-neutral-800 px-1 py-0.5 text-[11px] text-neutral-100 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onLoad}
          className="flex-1 truncate text-left text-[11px] text-neutral-300 hover:text-neutral-100"
          title={record.name}
        >
          {record.name}
        </button>
      )}
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <RowBtn icon="lucide:pencil" title="Rename" onClick={onStartRename} />
        <RowBtn icon="lucide:trash-2" title="Delete" danger onClick={onDelete} />
      </div>
    </div>
  )
}

function RowBtn({
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
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded text-neutral-500',
        danger ? 'hover:text-red-400' : 'hover:text-neutral-200',
      )}
    >
      <Icon icon={icon} width={11} height={11} />
    </button>
  )
}
