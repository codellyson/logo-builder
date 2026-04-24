import { useEffect } from 'react'
import { useCanvasStore } from '@/state/canvas-store'

type Extras = {
  onToggleHelp?: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(extras?: Extras) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      const store = useCanvasStore.getState()
      const temporal = useCanvasStore.temporal.getState()
      const mod = e.metaKey || e.ctrlKey
      const sel = store.selectedIds

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        extras?.onToggleHelp?.()
        return
      }

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) temporal.redo()
        else temporal.undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        temporal.redo()
        return
      }
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        store.selectAll()
        return
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        if (sel.length) store.duplicateNodes(sel)
        return
      }
      if (mod && e.key === ']') {
        if (sel.length === 0) return
        e.preventDefault()
        for (const id of sel) store.moveZ(id, e.shiftKey ? 'top' : 'up')
        return
      }
      if (mod && e.key === '[') {
        if (sel.length === 0) return
        e.preventDefault()
        for (const id of sel) store.moveZ(id, e.shiftKey ? 'bottom' : 'down')
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length === 0) return
        e.preventDefault()
        store.removeNodes(sel)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (store.editingBooleanId) store.setEditingBooleanId(null)
        else store.clearSelection()
        return
      }
      if (e.key.startsWith('Arrow') && sel.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') store.nudgeSelected(-step, 0)
        else if (e.key === 'ArrowRight') store.nudgeSelected(step, 0)
        else if (e.key === 'ArrowUp') store.nudgeSelected(0, -step)
        else if (e.key === 'ArrowDown') store.nudgeSelected(0, step)
      }
      if (mod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        if (e.shiftKey) {
          for (const id of sel) {
            const n = store.nodes.find((x) => x.id === id)
            if (n && n.type === 'group') store.ungroup(id)
          }
        } else if (sel.length >= 2) {
          store.group(sel)
        }
        return
      }
      // Boolean ops: ⌘⌥{U,S,I,X} create; ⌘⇧E flatten.
      // Uses e.code (physical key) because Alt on macOS rewrites e.key to a
      // dead-key character (Alt+U → "¨", Alt+I → "ˆ", etc.).
      if (mod && e.altKey) {
        const op =
          e.code === 'KeyU'
            ? 'unite'
            : e.code === 'KeyS'
              ? 'subtract'
              : e.code === 'KeyI'
                ? 'intersect'
                : e.code === 'KeyX'
                  ? 'exclude'
                  : null
        if (op && sel.length >= 2) {
          e.preventDefault()
          store.createBoolean(sel, op)
          return
        }
      }
      if (mod && e.shiftKey && e.code === 'KeyE') {
        e.preventDefault()
        for (const id of sel) {
          const n = store.nodes.find((x) => x.id === id)
          if (n && n.type === 'boolean') store.flattenBoolean(id)
        }
        return
      }
      // Alignment: ⌥{L,C,R,T,M,B} align; ⌥{H,V} distribute. +Shift = align-to-artboard.
      // Alt-primary because ⌘⇧<letter> clashes with browser shortcuts
      // (⌘⇧T = reopen tab, ⌘⇧R = hard reload, ⌘⇧C = Inspect, etc.) which
      // browsers don't allow pages to preventDefault.
      if (e.altKey && !mod && sel.length > 0) {
        const alignEdge: Record<string, 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'> = {
          KeyL: 'left',
          KeyC: 'hcenter',
          KeyR: 'right',
          KeyT: 'top',
          KeyM: 'vcenter',
          KeyB: 'bottom',
        }
        const edge = alignEdge[e.code]
        if (edge) {
          e.preventDefault()
          store.alignSelection(edge, e.shiftKey || sel.length < 2)
          return
        }
        if (e.code === 'KeyH' || e.code === 'KeyV') {
          e.preventDefault()
          store.distributeSelection(e.code === 'KeyH' ? 'h' : 'v')
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [extras])
}
