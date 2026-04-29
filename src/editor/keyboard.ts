import { useEffect } from 'react'
import { useCanvasStore } from '@/state/canvas-store'
import {
  deleteSegments,
  nudgeSegments,
  parseSegments,
  setSegmentStyles,
  type SegmentStyle,
} from '@/composition/path-edit-ops'

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
        // In edit-path mode, ⌘A selects every anchor on the active path.
        if (store.toolMode === 'edit-path' && store.pathEditState) {
          const node = store.nodes.find((x) => x.id === store.pathEditState!.nodeId)
          if (node && node.type === 'path') {
            const segs = parseSegments(node.data)
            store.setPathEditSelectedIndices(segs.map((_, i) => i))
            return
          }
        }
        store.selectAll()
        return
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        if (sel.length) store.duplicateNodes(sel)
        return
      }
      // ⌘X / ⌘C / ⌘V: internal clipboard. The OS clipboard isn't touched —
      // this is for moving editor selections only. Field-edit gating above
      // already let native Cut/Copy/Paste through inputs and contenteditables.
      if (mod && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        if (sel.length) store.cutNodes(sel)
        return
      }
      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        if (sel.length) store.copyNodes(sel)
        return
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        store.pasteClipboard()
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
        // In pen draft, Backspace pops the last placed anchor (or clears the
        // pending one). Lets users iteratively redraw without canceling.
        if (store.toolMode === 'pen' && store.penDraft) {
          e.preventDefault()
          store.penUndoLastAnchor()
          return
        }
        // Polygon crop in progress: pop the last anchor. If we're already
        // closed, re-open before popping so the user can keep editing.
        if (store.toolMode === 'crop-image' && store.cropEditState) {
          const d = store.cropEditState.draft
          if (d.kind === 'path' && d.points.length > 0) {
            e.preventDefault()
            store.updateCropDraft({
              points: d.points.slice(0, -2),
              closed: false,
            })
            return
          }
        }
        // In edit-path mode with anchor(s) selected, delete the anchors; leave
        // node itself alone. A deletion that would drop below 2 segments is a
        // no-op (avoid degenerate paths).
        if (store.toolMode === 'edit-path' && store.pathEditState) {
          const anchorIndices = store.pathEditState.selectedSegmentIndices
          if (anchorIndices.length > 0) {
            e.preventDefault()
            const node = store.nodes.find((x) => x.id === store.pathEditState!.nodeId)
            if (node && node.type === 'path') {
              const nextData = deleteSegments(node.data, anchorIndices)
              if (nextData) {
                store.updateNode(node.id, { data: nextData })
                store.setPathEditSelectedIndices([])
              }
            }
            return
          }
        }
        if (sel.length === 0) return
        e.preventDefault()
        store.removeNodes(sel)
        return
      }
      // Pen tool: P enters, V exits. Enter commits open, Escape cancels while drafting.
      if (!mod && !e.altKey && !e.shiftKey && e.code === 'KeyP' && store.toolMode !== 'pen') {
        e.preventDefault()
        store.setToolMode('pen')
        return
      }
      // Knife tool: K enters, V exits. No drafting state — strokes commit on
      // pointer-up directly.
      if (!mod && !e.altKey && !e.shiftKey && e.code === 'KeyK' && store.toolMode !== 'knife') {
        e.preventDefault()
        store.setToolMode('knife')
        return
      }
      if (
        !mod &&
        !e.altKey &&
        !e.shiftKey &&
        e.code === 'KeyV' &&
        (store.toolMode === 'pen' ||
          store.toolMode === 'edit-path' ||
          store.toolMode === 'knife')
      ) {
        e.preventDefault()
        if (store.toolMode === 'edit-path') store.exitPathEdit()
        else store.setToolMode('select')
        return
      }
      if (e.key === 'Enter' && store.toolMode === 'pen' && store.penDraft) {
        e.preventDefault()
        store.penCommit(false)
        return
      }
      // 1/2/3: anchor style in edit-path mode (corner/smooth/cusp) for selected anchors.
      if (
        !mod &&
        !e.altKey &&
        store.toolMode === 'edit-path' &&
        store.pathEditState &&
        store.pathEditState.selectedSegmentIndices.length > 0 &&
        (e.key === '1' || e.key === '2' || e.key === '3')
      ) {
        const style: SegmentStyle =
          e.key === '1' ? 'corner' : e.key === '2' ? 'smooth' : 'cusp'
        const node = store.nodes.find((x) => x.id === store.pathEditState!.nodeId)
        if (node && node.type === 'path') {
          e.preventDefault()
          const nextData = setSegmentStyles(
            node.data,
            store.pathEditState.selectedSegmentIndices,
            style,
          )
          if (nextData) store.updateNode(node.id, { data: nextData })
          return
        }
      }
      // A: enter path edit mode on a single selected PathNode.
      if (
        !mod &&
        !e.altKey &&
        !e.shiftKey &&
        e.code === 'KeyA' &&
        store.toolMode === 'select' &&
        sel.length === 1
      ) {
        const n = store.nodes.find((x) => x.id === sel[0])
        if (n && n.type === 'path') {
          e.preventDefault()
          store.enterPathEdit(n.id)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (store.toolMode === 'pen') store.penCancel()
        else if (store.toolMode === 'edit-path') store.exitPathEdit()
        else if (store.toolMode === 'knife') store.setToolMode('select')
        else if (store.toolMode === 'crop-image') store.cancelCrop()
        else if (store.editingBooleanId) store.setEditingBooleanId(null)
        else store.clearSelection()
        return
      }
      if (e.key === 'Enter' && store.toolMode === 'crop-image') {
        e.preventDefault()
        store.applyCrop()
        return
      }
      if (e.key.startsWith('Arrow')) {
        // In edit-path mode, arrow keys nudge selected anchors in node-local frame.
        if (
          store.toolMode === 'edit-path' &&
          store.pathEditState &&
          store.pathEditState.selectedSegmentIndices.length > 0
        ) {
          const node = store.nodes.find((x) => x.id === store.pathEditState!.nodeId)
          if (node && node.type === 'path') {
            e.preventDefault()
            const step = e.shiftKey ? 10 : 1
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
            const nextData = nudgeSegments(
              node.data,
              store.pathEditState.selectedSegmentIndices,
              dx,
              dy,
            )
            if (nextData) store.updateNode(node.id, { data: nextData })
            return
          }
        }
        if (sel.length === 0) return
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
