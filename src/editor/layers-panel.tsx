import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { LayerThumbnail } from '@/canvas/layer-thumbnail'
import { ContextMenu, type MenuItem } from '@/ui/context-menu'
import type { BooleanNode, BooleanOp, CanvasNode, GroupNode } from '@/canvas/types'
import { cn } from '@/lib/cn'

const BOOLEAN_BADGE: Record<BooleanOp, string> = {
  unite: 'U',
  subtract: 'S',
  intersect: 'I',
  exclude: 'X',
}

const BOOLEAN_LABELS: Record<BooleanOp, string> = {
  unite: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  exclude: 'Exclude (XOR)',
}

type DisplayRow = { node: CanvasNode; depth: number }

function buildDisplayRows(nodes: CanvasNode[]): DisplayRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows: DisplayRow[] = []
  const collapsedAncestors = new Set<string>()
  const display = [...nodes].reverse()
  for (const n of display) {
    let p = n.parentId
    let hidden = false
    while (p) {
      if (collapsedAncestors.has(p)) {
        hidden = true
        break
      }
      p = byId.get(p)?.parentId
    }
    let depth = 0
    p = n.parentId
    while (p) {
      depth++
      p = byId.get(p)?.parentId
    }
    if (
      (n.type === 'group' || n.type === 'boolean') &&
      (n as GroupNode | BooleanNode).collapsed
    ) {
      collapsedAncestors.add(n.id)
    }
    if (!hidden) rows.push({ node: n, depth })
  }
  return rows
}

export function LayersPanel() {
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const select = useCanvasStore((s) => s.select)
  const setHidden = useCanvasStore((s) => s.setHidden)
  const setLocked = useCanvasStore((s) => s.setLocked)
  const rename = useCanvasStore((s) => s.rename)
  const removeNodes = useCanvasStore((s) => s.removeNodes)
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes)
  const reorder = useCanvasStore((s) => s.reorder)
  const moveZ = useCanvasStore((s) => s.moveZ)
  const group = useCanvasStore((s) => s.group)
  const ungroup = useCanvasStore((s) => s.ungroup)
  const setCollapsed = useCanvasStore((s) => s.setCollapsed)
  const changeBooleanOp = useCanvasStore((s) => s.changeBooleanOp)
  const flattenBoolean = useCanvasStore((s) => s.flattenBoolean)
  const ungroupBoolean = useCanvasStore((s) => s.ungroupBoolean)

  const anchorRef = useRef<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined)

  const rows = buildDisplayRows(nodes)

  const selectionForClick = (id: string): string[] => {
    return [id]
  }

  const clickLayer = (id: string, e: React.MouseEvent) => {
    const ids = selectionForClick(id)
    if (e.shiftKey && anchorRef.current && anchorRef.current !== id) {
      const from = nodes.findIndex((n) => n.id === anchorRef.current)
      const to = nodes.findIndex((n) => n.id === id)
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        select(nodes.slice(lo, hi + 1).map((n) => n.id))
      }
    } else if (e.metaKey || e.ctrlKey) {
      const set = new Set(selectedIds)
      const first = ids[0]
      if (first && set.has(first)) {
        for (const i of ids) set.delete(i)
      } else {
        for (const i of ids) set.add(i)
      }
      select([...set])
      anchorRef.current = id
    } else {
      select(ids)
      anchorRef.current = id
    }
  }

  const openContext = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    const ids = selectionForClick(id)
    if (!ids.every((i) => selectedIds.includes(i))) {
      select(ids)
      anchorRef.current = id
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, id })
  }

  const contextItems = (id: string): MenuItem[] => {
    const n = nodes.find((x) => x.id === id)
    if (!n) return []
    const targetIds =
      selectedIds.length > 1 && selectedIds.includes(id) ? selectedIds : [id]
    const isGroup = n.type === 'group'
    const isBoolean = n.type === 'boolean'
    const canGroup =
      targetIds.length >= 2 &&
      new Set(targetIds.map((i) => nodes.find((x) => x.id === i)?.parentId)).size === 1

    const booleanItems: MenuItem[] = isBoolean
      ? [
          { kind: 'separator' },
          {
            label: `Change to Union${(n as BooleanNode).op === 'unite' ? ' ✓' : ''}`,
            icon: 'lucide:git-merge',
            onClick: () => changeBooleanOp(id, 'unite'),
          },
          {
            label: `Change to Subtract${(n as BooleanNode).op === 'subtract' ? ' ✓' : ''}`,
            icon: 'lucide:git-branch',
            onClick: () => changeBooleanOp(id, 'subtract'),
          },
          {
            label: `Change to Intersect${(n as BooleanNode).op === 'intersect' ? ' ✓' : ''}`,
            icon: 'lucide:diamond',
            onClick: () => changeBooleanOp(id, 'intersect'),
          },
          {
            label: `Change to Exclude${(n as BooleanNode).op === 'exclude' ? ' ✓' : ''}`,
            icon: 'lucide:x-circle',
            onClick: () => changeBooleanOp(id, 'exclude'),
          },
          { kind: 'separator' },
          {
            label: 'Flatten to Path',
            icon: 'lucide:spline',
            disabled: !(n as BooleanNode).cache?.data,
            onClick: () => flattenBoolean(id),
          },
          {
            label: 'Ungroup Boolean',
            icon: 'lucide:folder-minus',
            onClick: () => ungroupBoolean(id),
          },
        ]
      : []

    return [
      { label: 'Rename', icon: 'lucide:pencil', onClick: () => setRenamingId(id) },
      {
        label: 'Duplicate',
        icon: 'lucide:copy',
        shortcut: '⌘D',
        onClick: () => duplicateNodes(targetIds),
      },
      { kind: 'separator' },
      {
        label: 'Group',
        icon: 'lucide:folder-plus',
        shortcut: '⌘G',
        disabled: !canGroup,
        onClick: () => group(targetIds),
      },
      {
        label: 'Ungroup',
        icon: 'lucide:folder-minus',
        shortcut: '⌘⇧G',
        disabled: !isGroup,
        onClick: () => ungroup(id),
      },
      ...booleanItems,
      { kind: 'separator' },
      {
        label: 'Bring to Front',
        icon: 'lucide:chevrons-up',
        shortcut: '⌘⇧]',
        onClick: () => targetIds.forEach((t) => moveZ(t, 'top')),
      },
      {
        label: 'Bring Forward',
        icon: 'lucide:chevron-up',
        shortcut: '⌘]',
        onClick: () => targetIds.forEach((t) => moveZ(t, 'up')),
      },
      {
        label: 'Send Backward',
        icon: 'lucide:chevron-down',
        shortcut: '⌘[',
        onClick: () => targetIds.forEach((t) => moveZ(t, 'down')),
      },
      {
        label: 'Send to Back',
        icon: 'lucide:chevrons-down',
        shortcut: '⌘⇧[',
        onClick: () => targetIds.forEach((t) => moveZ(t, 'bottom')),
      },
      { kind: 'separator' },
      {
        label: n.hidden ? 'Show' : 'Hide',
        icon: n.hidden ? 'lucide:eye-off' : 'lucide:eye',
        onClick: () => targetIds.forEach((t) => setHidden(t, !n.hidden)),
      },
      {
        label: n.locked ? 'Unlock' : 'Lock',
        icon: n.locked ? 'lucide:lock' : 'lucide:unlock',
        onClick: () => targetIds.forEach((t) => setLocked(t, !n.locked)),
      },
      { kind: 'separator' },
      {
        label: 'Delete',
        icon: 'lucide:trash-2',
        shortcut: 'Del',
        danger: true,
        onClick: () => removeNodes(targetIds),
      },
    ]
  }

  const onDragStart = (id: string, e: React.DragEvent) => {
    const n = nodes.find((x) => x.id === id)
    if (n?.parentId || n?.type === 'group' || n?.type === 'boolean') {
      e.preventDefault()
      return
    }
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const onDragOverRow = (id: string, e: React.DragEvent) => {
    e.preventDefault()
    if (!dragId || dragId === id) {
      setDropBefore(undefined)
      return
    }
    const n = nodes.find((x) => x.id === id)
    if (n?.parentId) {
      setDropBefore(undefined)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const before = y < rect.height / 2
    if (before) {
      setDropBefore(id)
    } else {
      const topLevel = rows.filter((r) => !r.node.parentId).map((r) => r.node)
      const di = topLevel.findIndex((m) => m.id === id)
      const next = topLevel[di + 1]
      setDropBefore(next ? next.id : null)
    }
  }

  const onDragEnd = () => {
    if (!dragId || dropBefore === undefined) {
      setDragId(null)
      setDropBefore(undefined)
      return
    }
    const from = nodes.findIndex((n) => n.id === dragId)
    let to: number
    if (dropBefore === null) {
      to = 0
    } else {
      to = nodes.findIndex((n) => n.id === dropBefore)
    }
    if (from >= 0 && to >= 0 && to !== from) reorder(from, to)
    setDragId(null)
    setDropBefore(undefined)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
        Layers
      </div>
      <div className="mt-2 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-3 py-6 text-xs text-neutral-600">
            No layers yet. Add a shape from the toolbar.
          </div>
        )}
        {rows.map(({ node, depth }) => {
          const isGroup = node.type === 'group'
          const isBoolean = node.type === 'boolean'
          const isContainer = isGroup || isBoolean
          const collapsed =
            isContainer && !!(node as GroupNode | BooleanNode).collapsed
          const selected = selectedIds.includes(node.id)
          return (
            <div key={node.id}>
              {dragId && dropBefore === node.id && dragId !== node.id && (
                <div className="mx-2 h-0.5 rounded-full bg-indigo-500" />
              )}
              <div
                draggable={renamingId !== node.id && !node.parentId && !isContainer}
                onDragStart={(e) => onDragStart(node.id, e)}
                onDragOver={(e) => onDragOverRow(node.id, e)}
                onDragEnd={onDragEnd}
                onDrop={onDragEnd}
                onContextMenu={(e) => openContext(node.id, e)}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  if ((e.target as HTMLElement).closest('button, input')) return
                  clickLayer(node.id, e)
                }}
                style={{ paddingLeft: 8 + depth * 14 }}
                className={cn(
                  'group flex items-center gap-1.5 py-1 pr-2 text-xs',
                  'border-l-2 border-transparent',
                  selected && 'border-indigo-400 bg-neutral-800/60',
                  !selected && 'hover:bg-neutral-900',
                  dragId === node.id && 'opacity-40',
                )}
              >
                {isContainer ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCollapsed(node.id, !collapsed)
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
                  >
                    <Icon
                      icon={collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'}
                      width={12}
                      height={12}
                    />
                  </button>
                ) : (
                  <div className="w-4 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setHidden(node.id, !node.hidden)
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
                  title={node.hidden ? 'Show' : 'Hide'}
                >
                  <Icon icon={node.hidden ? 'lucide:eye-off' : 'lucide:eye'} width={13} height={13} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLocked(node.id, !node.locked)
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
                  title={node.locked ? 'Unlock' : 'Lock'}
                >
                  <Icon icon={node.locked ? 'lucide:lock' : 'lucide:unlock'} width={13} height={13} />
                </button>
                {isGroup ? (
                  <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-400">
                    <Icon icon="lucide:folder" width={13} height={13} />
                  </div>
                ) : isBoolean ? (
                  <div
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-indigo-500/20 text-[10px] font-bold text-indigo-300"
                    title={BOOLEAN_LABELS[(node as BooleanNode).op]}
                  >
                    {BOOLEAN_BADGE[(node as BooleanNode).op]}
                  </div>
                ) : (
                  <LayerThumbnail node={node} size={22} />
                )}
                {renamingId === node.id ? (
                  <input
                    autoFocus
                    defaultValue={node.name}
                    onBlur={(e) => {
                      rename(node.id, e.currentTarget.value || node.name)
                      setRenamingId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        rename(node.id, e.currentTarget.value || node.name)
                        setRenamingId(null)
                      } else if (e.key === 'Escape') {
                        setRenamingId(null)
                      }
                    }}
                    className="flex-1 rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100 outline-none"
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={cn(
                      'flex-1 cursor-text truncate',
                      isContainer ? 'font-medium text-neutral-200' : 'text-neutral-300',
                    )}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setRenamingId(node.id)
                    }}
                  >
                    {node.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeNodes([node.id])
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  <Icon icon="lucide:trash-2" width={13} height={13} />
                </button>
              </div>
            </div>
          )
        })}
        {dragId && dropBefore === null && (
          <div className="mx-2 mt-0.5 h-0.5 rounded-full bg-indigo-500" />
        )}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={contextItems(ctxMenu.id)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
