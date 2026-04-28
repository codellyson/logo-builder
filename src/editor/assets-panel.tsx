import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  AssetImportError,
  createAsset as importAsset,
  deleteAsset,
  listAssets,
  renameAsset,
} from '@/persistence/assets'
import type { AssetRecord } from '@/persistence/db'
import { createAsset as makeAssetNode, viewportInsertionCenter } from '@/canvas/factories'
import { cn } from '@/lib/cn'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

type SortMode = 'recent' | 'name' | 'type'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
]

export function AssetsPanel() {
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [sort, setSort] = useState<SortMode>('recent')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addNode = useCanvasStore((s) => s.addNode)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)

  // Fonts live in the same table but are managed via the font picker.
  // Surfacing them here would render broken thumbnails (FileReader can't
  // produce a useful preview from an OTF/TTF blob).
  const refresh = async () => {
    const all = await listAssets()
    setAssets(all.filter((a) => a.kind !== 'font'))
  }

  const sorted = useMemo(() => {
    const arr = [...assets]
    if (sort === 'recent') arr.sort((a, b) => b.updatedAt - a.updatedAt)
    else if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'type') {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
        return b.updatedAt - a.updatedAt
      })
    }
    return arr
  }, [assets, sort])
  useEffect(() => {
    refresh()
  }, [])

  const importFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(true)
    setError(null)
    let firstError: string | null = null
    for (const file of list) {
      try {
        await importAsset(file)
      } catch (err) {
        const msg =
          err instanceof AssetImportError
            ? `${file.name}: ${err.message}`
            : `${file.name}: import failed`
        if (!firstError) firstError = msg
      }
    }
    setBusy(false)
    if (firstError) setError(firstError)
    refresh()
  }

  const onPlace = (asset: AssetRecord) => {
    const state = useCanvasStore.getState()
    const { cx, cy } = viewportInsertionCenter(state.viewport, state.viewportSize, {
      stageWidth,
      stageHeight,
    })
    const step = 24
    const offset = (state.nodes.length % 6) * step - step * 2.5
    addNode(makeAssetNode(cx + offset, cy + offset, asset))
  }

  const onCommitRename = async (id: string, name: string) => {
    await renameAsset(id, name)
    setRenamingId(null)
    refresh()
  }

  const onDelete = async (id: string) => {
    await deleteAsset(id)
    refresh()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2 outline-none hover:border-line-strong"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          <Icon icon="lucide:upload" width={12} height={12} />
          Import
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) importFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300/70 hover:text-red-200"
          >
            <Icon icon="lucide:x" width={11} height={11} />
          </button>
        </div>
      )}
      <div
        onDragEnter={(e) => {
          if (Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files)
        }}
        className={cn(
          'mt-2 flex-1 overflow-y-auto p-2',
          dragOver && 'bg-indigo-500/5 outline-dashed outline-2 -outline-offset-2 outline-indigo-500/40',
        )}
      >
        {busy && (
          <div className="px-1 pb-2 text-[11px] text-ink-4">Importing…</div>
        )}
        {assets.length === 0 && !busy && (
          <div className="px-2 py-8 text-center text-xs text-ink-4">
            Drop or import images and SVGs here.
          </div>
        )}
        {assets.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {sorted.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                renaming={renamingId === a.id}
                onClick={() => onPlace(a)}
                onStartRename={() => setRenamingId(a.id)}
                onCancelRename={() => setRenamingId(null)}
                onCommitRename={(name) => onCommitRename(a.id, name)}
                onDelete={() => onDelete(a.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AssetTile({
  asset,
  renaming,
  onClick,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDelete,
}: {
  asset: AssetRecord
  renaming: boolean
  onClick: () => void
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: (name: string) => void
  onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(asset.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [asset.blob, asset.id])

  return (
    <div className="group flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        title={asset.name}
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded border border-line bg-surface-2 hover:border-indigo-500/60"
      >
        {url && (
          <img
            src={url}
            alt={asset.name}
            className="max-h-full max-w-full object-contain p-1"
            draggable={false}
          />
        )}
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <TileBtn
            icon="lucide:pencil"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation()
              onStartRename()
            }}
          />
          <TileBtn
            icon="lucide:trash-2"
            title="Delete"
            danger
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          />
        </div>
      </button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={asset.name}
          onBlur={(e) => onCommitRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename(e.currentTarget.value)
            else if (e.key === 'Escape') onCancelRename()
          }}
          className="rounded bg-surface-3 px-1 py-0.5 text-[11px] text-ink outline-none"
        />
      ) : (
        <span
          className="cursor-text truncate text-[11px] text-ink-3"
          onDoubleClick={onStartRename}
          title={asset.name}
        >
          {asset.name}
        </span>
      )}
    </div>
  )
}

function TileBtn({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: string
  title: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded bg-surface/80 text-ink-3 backdrop-blur',
        danger ? 'hover:text-red-400' : 'hover:text-ink',
      )}
    >
      <Icon icon={icon} width={11} height={11} />
    </button>
  )
}
