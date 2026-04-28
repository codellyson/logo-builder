import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { cn } from '@/lib/cn'
import type { CanvasNode } from '@/canvas/types'

// Right-click menu over the canvas. Listens for `contextmenu` on the
// container element passed via `targetRef` so right-clicks elsewhere
// (header, sidebars) still get the OS menu. Items dispatch to existing
// store actions and disable based on the same predicates the toolbars
// already compute.
type Props = {
  targetRef: React.RefObject<HTMLElement | null>
  // Looks up the node id at a given client-space point. Wired from the
  // stage so we can match Konva's hit testing without re-implementing it
  // here. Returning null means "the user right-clicked empty canvas."
  hitTest?: (clientX: number, clientY: number) => string | null
}

export function ContextMenu({ targetRef, hitTest }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      e.preventDefault()
      const store = useCanvasStore.getState()
      // Auto-select the node under the cursor if the user right-clicked
      // an unselected node. This matches Figma/Illustrator and avoids the
      // "menu acts on stale selection" footgun. Right-clicking already-
      // selected geometry preserves the multi-selection.
      const hitId = hitTest?.(e.clientX, e.clientY) ?? null
      if (hitId && !store.selectedIds.includes(hitId)) {
        store.select([hitId])
      } else if (!hitId && store.selectedIds.length > 0) {
        store.select([])
      }
      setPos({ x: e.clientX, y: e.clientY })
    }
    el.addEventListener('contextmenu', handler)
    return () => el.removeEventListener('contextmenu', handler)
  }, [targetRef, hitTest])

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null)
    }
    // mousedown closes on next click anywhere; capture phase so item
    // clicks fire first via their onClick handlers.
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [pos])

  if (!pos) return null
  return createPortal(<MenuPanel pos={pos} onClose={() => setPos(null)} />, document.body)
}

function MenuPanel({ pos, onClose }: { pos: { x: number; y: number }; onClose: () => void }) {
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const hasClipboard = useCanvasStore((s) => s.clipboard !== null)

  const selected = nodes.filter((n) => selectedIds.includes(n.id))
  const hasSelection = selected.length > 0
  const selectionAllLocked = hasSelection && selected.every((n) => n.locked)
  const selectionAllHidden = hasSelection && selected.every((n) => n.hidden)
  const canGroup = selected.length >= 2
  const canUngroup = selected.some((n) => n.type === 'group')
  const canBreakApart = selected.some(
    (n) => n.type === 'path' && (n.data.match(/[Mm]/g) ?? []).length > 1,
  )
  const canConvertToPath = selected.some(
    (n) => n.type === 'rect' || n.type === 'ellipse' || n.type === 'line',
  )
  const canTextToOutlines = selected.some((n) => n.type === 'text')

  // Position-clamp so the menu doesn't fall off-screen. Estimate panel
  // size; an extra few pixels of slop is fine since the menu has a min
  // width and short item list.
  const PANEL_W = 220
  const PANEL_H = 360
  const left = Math.min(pos.x, window.innerWidth - PANEL_W - 8)
  const top = Math.min(pos.y, window.innerHeight - PANEL_H - 8)

  return (
    <div
      style={{ position: 'fixed', top, left, zIndex: 50 }}
      className="w-52 rounded-md border border-line bg-surface p-1 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item
        icon="lucide:scissors"
        label="Cut"
        shortcut="⌘X"
        disabled={!hasSelection}
        onClick={() => {
          useCanvasStore.getState().cutNodes(selectedIds)
          onClose()
        }}
      />
      <Item
        icon="lucide:clipboard"
        label="Copy"
        shortcut="⌘C"
        disabled={!hasSelection}
        onClick={() => {
          useCanvasStore.getState().copyNodes(selectedIds)
          onClose()
        }}
      />
      <Item
        icon="lucide:clipboard-paste"
        label="Paste"
        shortcut="⌘V"
        disabled={!hasClipboard}
        onClick={() => {
          useCanvasStore.getState().pasteClipboard()
          onClose()
        }}
      />
      <Item
        icon="lucide:copy"
        label="Duplicate"
        shortcut="⌘D"
        disabled={!hasSelection}
        onClick={() => {
          useCanvasStore.getState().duplicateNodes(selectedIds)
          onClose()
        }}
      />
      <Divider />
      <Item
        icon="lucide:group"
        label="Group"
        shortcut="⌘G"
        disabled={!canGroup}
        onClick={() => {
          useCanvasStore.getState().group(selectedIds)
          onClose()
        }}
      />
      <Item
        icon="lucide:ungroup"
        label="Ungroup"
        shortcut="⌘⇧G"
        disabled={!canUngroup}
        onClick={() => {
          const store = useCanvasStore.getState()
          for (const n of selected) if (n.type === 'group') store.ungroup(n.id)
          onClose()
        }}
      />
      <Divider />
      <Item
        icon="lucide:chevrons-up"
        label="Bring to front"
        shortcut="]"
        disabled={!hasSelection}
        onClick={() => moveZAll(selected, 'top', onClose)}
      />
      <Item
        icon="lucide:chevron-up"
        label="Bring forward"
        disabled={!hasSelection}
        onClick={() => moveZAll(selected, 'up', onClose)}
      />
      <Item
        icon="lucide:chevron-down"
        label="Send backward"
        disabled={!hasSelection}
        onClick={() => moveZAll(selected, 'down', onClose)}
      />
      <Item
        icon="lucide:chevrons-down"
        label="Send to back"
        shortcut="["
        disabled={!hasSelection}
        onClick={() => moveZAll(selected, 'bottom', onClose)}
      />
      <Divider />
      <Item
        icon={selectionAllLocked ? 'lucide:unlock' : 'lucide:lock'}
        label={selectionAllLocked ? 'Unlock' : 'Lock'}
        disabled={!hasSelection}
        onClick={() => {
          const store = useCanvasStore.getState()
          for (const n of selected) store.setLocked(n.id, !selectionAllLocked)
          onClose()
        }}
      />
      <Item
        icon={selectionAllHidden ? 'lucide:eye' : 'lucide:eye-off'}
        label={selectionAllHidden ? 'Show' : 'Hide'}
        disabled={!hasSelection}
        onClick={() => {
          const store = useCanvasStore.getState()
          for (const n of selected) store.setHidden(n.id, !selectionAllHidden)
          onClose()
        }}
      />
      {(canConvertToPath || canTextToOutlines || canBreakApart) && <Divider />}
      {canConvertToPath && (
        <Item
          icon="lucide:spline"
          label="Convert to path"
          onClick={async () => {
            const { convertToPath } = await import('@/composition/convert-to-path')
            const store = useCanvasStore.getState()
            const newIds: string[] = []
            for (const n of selected) {
              if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'line') {
                const p = convertToPath(n)
                if (p) {
                  store.addNode(p)
                  store.removeNodes([n.id])
                  newIds.push(p.id)
                }
              }
            }
            if (newIds.length) store.select(newIds)
            onClose()
          }}
        />
      )}
      {canTextToOutlines && (
        <Item
          icon="lucide:type"
          label="Text → Outlines"
          onClick={() => {
            // Defer to the toolbar's full implementation (handles per-glyph
            // wrapping, font fallback, etc.) by dispatching a synthetic click
            // on the toolbar button — keeps this menu free of duplicated logic.
            const btn = document.querySelector<HTMLButtonElement>(
              'button[title="Text → Outlines"]',
            )
            btn?.click()
            onClose()
          }}
        />
      )}
      {canBreakApart && (
        <Item
          icon="lucide:scissors"
          label="Break apart subpaths"
          onClick={() => {
            const btn = document.querySelector<HTMLButtonElement>(
              'button[title="Break apart subpaths"]',
            )
            btn?.click()
            onClose()
          }}
        />
      )}
      <Divider />
      <Item
        icon="lucide:trash-2"
        label="Delete"
        shortcut="⌫"
        danger
        disabled={!hasSelection}
        onClick={() => {
          useCanvasStore.getState().removeNodes(selectedIds)
          onClose()
        }}
      />
    </div>
  )
}

function moveZAll(selected: CanvasNode[], dir: 'up' | 'down' | 'top' | 'bottom', onClose: () => void) {
  const store = useCanvasStore.getState()
  // For 'top'/'bottom' the order doesn't matter; for 'up'/'down' iterate
  // in z-order so adjacent siblings don't trample each other.
  const orderedIds = selected.map((n) => n.id)
  for (const id of orderedIds) store.moveZ(id, dir)
  onClose()
}

function Item({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  danger,
}: {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs',
        disabled
          ? 'cursor-not-allowed text-ink-4'
          : danger
            ? 'text-ink-2 hover:bg-red-500/10 hover:text-red-300'
            : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
      )}
    >
      <Icon icon={icon} width={13} height={13} />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-ink-4">{shortcut}</span>}
    </button>
  )
}

function Divider() {
  return <div className="my-1 border-t border-line" />
}
