import { create } from 'zustand'
import { temporal } from 'zundo'
import { useStore } from 'zustand'
import type { BooleanCache, BooleanNode, BooleanOp, CanvasNode, Effect, Fill, GroupNode, ImageCrop, ImageCropPath, ImageCropRect, PathNode, Viewport } from '@/canvas/types'
import { solidFill } from '@/composition/fills'
import { newId } from '@/lib/id'
import { DEFAULT_PALETTE, generatePalette, type Palette } from '@/colors/palette'
import { getNodeBbox, getSelectionBbox } from '@/composition/bbox'
import { viewportInsertionCenter } from '@/canvas/factories'

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'h' | 'v'

export type ToolMode = 'select' | 'pen' | 'edit-path' | 'knife' | 'crop-image'

export type PathEditState = {
  nodeId: string
  selectedSegmentIndices: number[]
} | null

export type CropMode = 'rect' | 'polygon' | 'lasso'

// In-progress image crop. The draft is committed onto the asset node (as
// `crop`) on Apply; cancel discards it. Lives on the store so the canvas
// transformer / overlay / keyboard can all observe it.
//
// Rect drafts use the same shape as the committed `ImageCropRect`. Polygon
// / lasso drafts are point arrays — open while still being traced, then
// converted to path-data on close (Polygon: click first anchor / Lasso:
// pointer-up). Apply turns either draft form into a final `ImageCrop`.
export type CropPathDraft = {
  kind: 'path'
  points: number[] // x, y, x, y, ...
  closed: boolean
}

export type CropEditState = {
  nodeId: string
  mode: CropMode
  draft: ImageCropRect | CropPathDraft
} | null

// Handle deltas are relative to the segment's anchor point.
export type PenDraftSegment = {
  x: number
  y: number
  handleIn?: { dx: number; dy: number }
  handleOut?: { dx: number; dy: number }
}

export type PenDraftState = {
  segments: PenDraftSegment[]
  // In-progress anchor while the user is holding mousedown. Mouse movement updates
  // its handleOut (and mirrors to handleIn unless Alt is held). On mouseup, the
  // pending segment is pushed into `segments`.
  pending: PenDraftSegment | null
  cursor: { x: number; y: number } | null
} | null

// Internal clipboard. Persists for the tab's lifetime — no OS clipboard
// interop. `nodes` is a deep snapshot (originals untouched); `rootIds` marks
// which entries become top-level on paste, and `bbox` is captured at copy
// time so paste can recenter on the current viewport without re-walking.
export type ClipboardPayload = {
  nodes: CanvasNode[]
  rootIds: string[]
  bbox: { x: number; y: number; width: number; height: number }
}

// Converts a crop draft into the final committed shape, or null if it's
// degenerate. Rect drafts collapse to null when below ~half a pixel in
// either axis (would render the image invisible). Path drafts require a
// closed loop with at least 3 points (a triangle is the minimum
// non-degenerate region) and emit `M ... L ... Z` data.
function finalizeCropDraft(
  draft: ImageCropRect | CropPathDraft,
): ImageCrop | null {
  if (draft.kind === 'rect') {
    if (draft.width < 0.5 || draft.height < 0.5) return null
    return draft
  }
  if (!draft.closed || draft.points.length < 6) return null
  const pts = draft.points
  let d = `M${pts[0]},${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += ` L${pts[i]},${pts[i + 1]}`
  d += ' Z'
  const path: ImageCropPath = { kind: 'path', data: d }
  return path
}

function invalidateBooleanAncestors(
  nodes: CanvasNode[],
  changedIds: Iterable<string>,
  { includeSelf = false }: { includeSelf?: boolean } = {},
): CanvasNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const toInvalidate = new Set<string>()
  for (const id of changedIds) {
    let current = nodeMap.get(id)
    if (includeSelf && current?.type === 'boolean') toInvalidate.add(current.id)
    while (current?.parentId) {
      const parent = nodeMap.get(current.parentId)
      if (!parent) break
      if (parent.type === 'boolean') toInvalidate.add(parent.id)
      current = parent
    }
  }
  if (toInvalidate.size === 0) return nodes
  return nodes.map((n) =>
    toInvalidate.has(n.id) && n.type === 'boolean'
      ? ({ ...n, cache: null } as BooleanNode)
      : n,
  )
}

type CanvasState = {
  nodes: CanvasNode[]
  selectedIds: string[]
  stageWidth: number
  stageHeight: number
  viewport: Viewport
  // Screen-pixel size of the canvas surface, mirrored from the Stage's
  // ResizeObserver. Lives in the store so non-canvas UI (toolbar, etc.)
  // can compute the world-space center of the visible viewport without
  // reaching into the stage's local state.
  viewportSize: { width: number; height: number }
  palette: Palette
  artboardBackground: string
  fitRequestId: number
  editingBooleanId: string | null
  toolMode: ToolMode
  penDraft: PenDraftState
  pathEditState: PathEditState
  cropEditState: CropEditState
  clipboard: ClipboardPayload | null
  // Identity of the project the autosave loop writes to. Mirrored from the
  // localStorage-backed active id so components can subscribe and re-render
  // (e.g. the header showing the current project name).
  activeProjectId: string | null
  activeProjectName: string
}

type CanvasActions = {
  addNode: (node: CanvasNode) => void
  addNodes: (nodes: CanvasNode[]) => void
  updateNode: (id: string, patch: Partial<CanvasNode>) => void
  removeNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => void
  copyNodes: (ids: string[]) => void
  cutNodes: (ids: string[]) => void
  pasteClipboard: () => void
  moveZ: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  reorder: (from: number, to: number) => void
  rename: (id: string, name: string) => void
  setLocked: (id: string, locked: boolean) => void
  setHidden: (id: string, hidden: boolean) => void
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  group: (ids: string[]) => void
  ungroup: (groupId: string) => void
  setCollapsed: (groupId: string, collapsed: boolean) => void
  createBoolean: (ids: string[], op: BooleanOp) => string | null
  changeBooleanOp: (id: string, op: BooleanOp) => void
  setBooleanCache: (id: string, cache: BooleanCache | null) => void
  flattenBoolean: (id: string) => void
  ungroupBoolean: (id: string) => void
  setEditingBooleanId: (id: string | null) => void
  setToolMode: (mode: ToolMode) => void
  penBeginAnchor: (x: number, y: number) => void
  penUpdatePendingHandle: (dx: number, dy: number, breakSymmetry: boolean) => void
  penFinalizePending: () => void
  penUndoLastAnchor: () => void
  penSetCursor: (x: number, y: number) => void
  penCommit: (closed: boolean) => Promise<string | null>
  penCancel: () => void
  enterPathEdit: (nodeId: string) => void
  setPathEditSelectedIndices: (indices: number[]) => void
  exitPathEdit: () => void
  enterImageCrop: (nodeId: string) => void
  setCropMode: (mode: CropMode) => void
  updateCropDraft: (patch: Partial<ImageCropRect> | Partial<CropPathDraft>) => void
  applyCrop: () => void
  cancelCrop: () => void
  resetCrop: (nodeId: string) => void
  alignSelection: (edge: AlignEdge, toArtboard?: boolean) => void
  distributeSelection: (axis: DistributeAxis) => void
  selectAll: () => void
  nudgeSelected: (dx: number, dy: number) => void
  setViewport: (v: Partial<Viewport>) => void
  setViewportSize: (w: number, h: number) => void
  setStageSize: (w: number, h: number) => void
  setPaletteSeed: (hex: string) => void
  setPalette: (palette: Palette) => void
  setArtboardBackground: (hex: string) => void
  requestFit: () => void
  replaceState: (
    snapshot: Pick<CanvasState, 'nodes' | 'stageWidth' | 'stageHeight'> & { palette?: Palette },
  ) => void
  replaceNode: (id: string, next: CanvasNode | CanvasNode[]) => void
  addEffect: (nodeId: string, effect: Effect) => void
  updateEffect: (nodeId: string, index: number, patch: Partial<Effect>) => void
  removeEffect: (nodeId: string, index: number) => void
  reorderEffect: (nodeId: string, from: number, to: number) => void
  setActiveProjectId: (id: string | null) => void
  setActiveProjectName: (name: string) => void
}

const initialState: CanvasState = {
  nodes: [],
  selectedIds: [],
  stageWidth: 800,
  stageHeight: 800,
  viewport: { x: 0, y: 0, scale: 1 },
  viewportSize: { width: 0, height: 0 },
  palette: DEFAULT_PALETTE,
  artboardBackground: '#ffffff',
  fitRequestId: 0,
  editingBooleanId: null,
  toolMode: 'select',
  penDraft: null,
  pathEditState: null,
  cropEditState: null,
  clipboard: null,
  activeProjectId: null,
  activeProjectName: 'Untitled',
}

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node], selectedIds: [node.id] })),

      // Bulk insert. Caller orders the array per the canvas-store z-order
      // convention (children before their parent container) and sets
      // parentIds. Selects the topmost (last) node — typically the wrapping
      // group when adding a subtree.
      addNodes: (added) =>
        set((s) => {
          if (added.length === 0) return s
          return {
            nodes: [...s.nodes, ...added],
            selectedIds: [added[added.length - 1].id],
          }
        }),

      updateNode: (id, patch) =>
        set((s) => {
          const next = s.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CanvasNode) : n))
          return { nodes: invalidateBooleanAncestors(next, [id]) }
        }),

      removeNodes: (ids) => {
        const state = get()
        const toRemove = new Set<string>()
        const queue = [...ids]
        while (queue.length) {
          const id = queue.shift()!
          if (toRemove.has(id)) continue
          toRemove.add(id)
          for (const child of state.nodes) {
            if (child.parentId === id) queue.push(child.id)
          }
        }
        // Ancestors of removed nodes need cache invalidation (before the removal,
        // so the walk can still reach them through parentId).
        const parentIdsOfRemoved = new Set<string>()
        for (const n of state.nodes) {
          if (toRemove.has(n.id) && n.parentId && !toRemove.has(n.parentId)) {
            parentIdsOfRemoved.add(n.parentId)
          }
        }
        set((s) => {
          const filtered = s.nodes.filter((n) => !toRemove.has(n.id))
          const clearPathEdit = s.pathEditState && toRemove.has(s.pathEditState.nodeId)
          return {
            nodes: invalidateBooleanAncestors(filtered, parentIdsOfRemoved, { includeSelf: true }),
            selectedIds: s.selectedIds.filter((i) => !toRemove.has(i)),
            editingBooleanId:
              s.editingBooleanId && toRemove.has(s.editingBooleanId) ? null : s.editingBooleanId,
            pathEditState: clearPathEdit ? null : s.pathEditState,
            toolMode: clearPathEdit ? 'select' : s.toolMode,
          }
        })
      },

      duplicateNodes: (ids) => {
        const { nodes } = get()
        const rootIds = new Set(ids)
        const toDup = new Set<string>()
        const queue = [...ids]
        while (queue.length) {
          const id = queue.shift()!
          if (toDup.has(id)) continue
          toDup.add(id)
          for (const child of nodes) {
            if (child.parentId === id) queue.push(child.id)
          }
        }
        const idMap = new Map<string, string>()
        for (const id of toDup) idMap.set(id, newId())
        const dupes: CanvasNode[] = []
        const newSelected: string[] = []
        for (const n of nodes) {
          if (!toDup.has(n.id)) continue
          const copyId = idMap.get(n.id)!
          const remappedParent =
            n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId) : n.parentId
          const isRoot = rootIds.has(n.id)
          const copy = {
            ...n,
            id: copyId,
            parentId: remappedParent,
            ...(isRoot
              ? { x: n.x + 16, y: n.y + 16, name: `${n.name} copy` }
              : {}),
          } as CanvasNode
          dupes.push(copy)
          if (isRoot) newSelected.push(copyId)
        }
        set((s) => ({ nodes: [...s.nodes, ...dupes], selectedIds: newSelected }))
      },

      copyNodes: (ids) => {
        if (ids.length === 0) return
        const { nodes } = get()
        const rootSet = new Set(ids)
        const captured = new Set<string>()
        const queue = [...ids]
        while (queue.length) {
          const id = queue.shift()!
          if (captured.has(id)) continue
          captured.add(id)
          for (const child of nodes) {
            if (child.parentId === id) queue.push(child.id)
          }
        }
        // Snapshot in tree order. structuredClone keeps boolean caches and
        // any nested object fields (effects, points arrays) independent of
        // the live store — paste must never alias originals.
        const snapshot: CanvasNode[] = []
        for (const n of nodes) if (captured.has(n.id)) snapshot.push(structuredClone(n))
        // World-ish bbox: union of every leaf node's bbox in its parent
        // frame. Matches the codebase's existing alignment convention; minor
        // group-transform skew is acceptable since paste re-centers on the
        // viewport anyway.
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const n of snapshot) {
          const b = getNodeBbox(n)
          if (!b) continue
          if (b.x < minX) minX = b.x
          if (b.y < minY) minY = b.y
          if (b.x + b.width > maxX) maxX = b.x + b.width
          if (b.y + b.height > maxY) maxY = b.y + b.height
        }
        const bbox =
          minX === Infinity
            ? { x: 0, y: 0, width: 0, height: 0 }
            : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        set({
          clipboard: {
            nodes: snapshot,
            rootIds: snapshot.filter((n) => rootSet.has(n.id)).map((n) => n.id),
            bbox,
          },
        })
      },

      cutNodes: (ids) => {
        if (ids.length === 0) return
        get().copyNodes(ids)
        get().removeNodes(ids)
      },

      pasteClipboard: () => {
        const { clipboard, viewport, viewportSize, stageWidth, stageHeight } = get()
        if (!clipboard) return
        const { cx, cy } = viewportInsertionCenter(viewport, viewportSize, {
          stageWidth,
          stageHeight,
        })
        const dx = cx - (clipboard.bbox.x + clipboard.bbox.width / 2)
        const dy = cy - (clipboard.bbox.y + clipboard.bbox.height / 2)
        const idMap = new Map<string, string>()
        for (const n of clipboard.nodes) idMap.set(n.id, newId())
        const rootSet = new Set(clipboard.rootIds)
        const pasted: CanvasNode[] = []
        const newSelected: string[] = []
        for (const n of clipboard.nodes) {
          const fresh = structuredClone(n)
          fresh.id = idMap.get(n.id)!
          // Re-parent: descendants point at the new id of their parent in
          // the snapshot; roots become top-level regardless of where they
          // came from. (Pasting back into the original group would surprise
          // users who expect paste to land where they're looking.)
          if (rootSet.has(n.id)) {
            fresh.parentId = undefined
            fresh.x += dx
            fresh.y += dy
            newSelected.push(fresh.id)
          } else if (n.parentId && idMap.has(n.parentId)) {
            fresh.parentId = idMap.get(n.parentId)
          }
          pasted.push(fresh)
        }
        set((s) => ({ nodes: [...s.nodes, ...pasted], selectedIds: newSelected }))
      },

      moveZ: (id, dir) =>
        set((s) => {
          const i = s.nodes.findIndex((n) => n.id === id)
          if (i < 0) return s
          const next = [...s.nodes]
          const [node] = next.splice(i, 1)
          if (dir === 'up') next.splice(Math.min(s.nodes.length - 1, i + 1), 0, node)
          else if (dir === 'down') next.splice(Math.max(0, i - 1), 0, node)
          else if (dir === 'top') next.push(node)
          else next.unshift(node)
          return { nodes: next }
        }),

      reorder: (from, to) =>
        set((s) => {
          if (from === to) return s
          const next = [...s.nodes]
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return { nodes: next }
        }),

      rename: (id, name) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
        })),

      setLocked: (id, locked) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, locked } : n)),
        })),

      setHidden: (id, hidden) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, hidden } : n)),
        })),

      select: (ids) => set({ selectedIds: ids }),

      group: (ids) => {
        const state = get()
        const targetSet = new Set(ids)
        const targets = state.nodes.filter((n) => targetSet.has(n.id))
        if (targets.length < 2) return
        const parentIds = new Set(targets.map((t) => t.parentId))
        if (parentIds.size > 1) return
        const sharedParent = targets[0].parentId
        const group: GroupNode = {
          id: newId(),
          type: 'group',
          name: 'Group',
          locked: false,
          hidden: false,
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          parentId: sharedParent,
          collapsed: false,
        }
        const others = state.nodes.filter((n) => !targetSet.has(n.id))
        const indices = state.nodes
          .map((n, i) => (targetSet.has(n.id) ? i : -1))
          .filter((i) => i >= 0)
        const topIdx = Math.max(...indices)
        const insertPos = topIdx + 1 - targets.length
        const reparented = targets.map((t) => ({ ...t, parentId: group.id }) as CanvasNode)
        const next = [
          ...others.slice(0, insertPos),
          ...reparented,
          group,
          ...others.slice(insertPos),
        ]
        set({ nodes: next, selectedIds: [group.id] })
      },

      ungroup: (groupId) => {
        const state = get()
        const group = state.nodes.find((n) => n.id === groupId && n.type === 'group')
        if (!group) return
        const g = group as GroupNode
        const rad = (g.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const childIds: string[] = []
        const next = state.nodes.flatMap((n) => {
          if (n.id === groupId) return []
          if (n.parentId === groupId) {
            childIds.push(n.id)
            const rx = n.x * cos - n.y * sin
            const ry = n.x * sin + n.y * cos
            return [
              {
                ...n,
                x: g.x + rx,
                y: g.y + ry,
                rotation: n.rotation + g.rotation,
                parentId: g.parentId,
              } as CanvasNode,
            ]
          }
          return [n]
        })
        set({ nodes: next, selectedIds: childIds })
      },

      setCollapsed: (groupId, collapsed) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            (n.id === groupId && (n.type === 'group' || n.type === 'boolean'))
              ? ({ ...n, collapsed } as CanvasNode)
              : n,
          ),
        })),

      createBoolean: (ids, op) => {
        const state = get()
        const targetSet = new Set(ids)
        const targets = state.nodes.filter((n) => targetSet.has(n.id))
        if (targets.length < 2) return null
        // Each target must contribute some geometry: either a fill or a visible stroke.
        // Lines are fine as long as their stroke has positive width.
        const contributesGeometry = (t: CanvasNode): boolean => {
          if ('fill' in t && t.fill) return true
          if ('stroke' in t && t.stroke && 'strokeWidth' in t && t.strokeWidth > 0) return true
          if (t.type === 'group' || t.type === 'boolean' || t.type === 'text' || t.type === 'icon')
            return true
          return false
        }
        if (!targets.every(contributesGeometry)) return null
        const parentIds = new Set(targets.map((t) => t.parentId))
        if (parentIds.size > 1) return null
        const sharedParent = targets[0].parentId

        let fill: Fill | null = solidFill('#000000')
        let stroke: Fill | null = null
        let strokeWidth = 0
        for (const t of targets) {
          if ('fill' in t && t.fill != null) {
            fill = t.fill
            if ('stroke' in t) stroke = t.stroke
            if ('strokeWidth' in t) strokeWidth = t.strokeWidth
            break
          }
        }

        const boolean: BooleanNode = {
          id: newId(),
          type: 'boolean',
          name: 'Boolean',
          locked: false,
          hidden: false,
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          parentId: sharedParent,
          op,
          fill,
          stroke,
          strokeWidth,
          collapsed: false,
          cache: null,
        }

        const others = state.nodes.filter((n) => !targetSet.has(n.id))
        const indices = state.nodes
          .map((n, i) => (targetSet.has(n.id) ? i : -1))
          .filter((i) => i >= 0)
        const bottomIdx = Math.min(...indices)
        const insertPos = bottomIdx
        const reparented = targets.map((t) => ({ ...t, parentId: boolean.id }) as CanvasNode)
        const next = [
          ...others.slice(0, insertPos),
          ...reparented,
          boolean,
          ...others.slice(insertPos),
        ]
        set({ nodes: next, selectedIds: [boolean.id] })
        return boolean.id
      },

      changeBooleanOp: (id, op) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id && n.type === 'boolean'
              ? ({ ...n, op, cache: null } as BooleanNode)
              : n,
          ),
        })),

      setBooleanCache: (id, cache) =>
        set((s) => {
          const next = s.nodes.map((n) =>
            n.id === id && n.type === 'boolean' ? ({ ...n, cache } as BooleanNode) : n,
          )
          // When a nested boolean's cache resolves, any boolean ancestor that depended
          // on it needs to re-evaluate. Walks up; no-op for top-level booleans.
          return { nodes: invalidateBooleanAncestors(next, [id]) }
        }),

      flattenBoolean: (id) => {
        const state = get()
        const boolean = state.nodes.find((n) => n.id === id && n.type === 'boolean') as
          | BooleanNode
          | undefined
        if (!boolean || !boolean.cache) return

        const toRemove = new Set<string>([id])
        const queue = [id]
        while (queue.length) {
          const parent = queue.shift()!
          for (const c of state.nodes) {
            if (c.parentId === parent && !toRemove.has(c.id)) {
              toRemove.add(c.id)
              queue.push(c.id)
            }
          }
        }

        const flat: PathNode = {
          id: newId(),
          type: 'path',
          name: boolean.name,
          locked: boolean.locked,
          hidden: boolean.hidden,
          x: boolean.x,
          y: boolean.y,
          rotation: boolean.rotation,
          opacity: boolean.opacity,
          blendMode: boolean.blendMode,
          parentId: boolean.parentId,
          data: boolean.cache.data,
          fill: boolean.fill,
          stroke: boolean.stroke,
          strokeWidth: boolean.strokeWidth,
          width: boolean.cache.width,
          height: boolean.cache.height,
        }

        const booleanIdx = state.nodes.findIndex((n) => n.id === id)
        const kept: CanvasNode[] = []
        for (let i = 0; i < state.nodes.length; i++) {
          if (toRemove.has(state.nodes[i].id)) continue
          if (i === booleanIdx) kept.push(flat)
          kept.push(state.nodes[i])
        }
        if (!kept.includes(flat)) kept.push(flat)

        set({ nodes: kept, selectedIds: [flat.id] })
      },

      setEditingBooleanId: (id) =>
        set((s) => ({
          editingBooleanId: id,
          // Entering edit mode clears selection so the ghosted boolean doesn't
          // keep the Transformer attached to it.
          selectedIds: id ? [] : s.selectedIds,
        })),

      setToolMode: (mode) =>
        set((s) => ({
          toolMode: mode,
          penDraft:
            mode === 'pen'
              ? (s.penDraft ?? { segments: [], pending: null, cursor: null })
              : null,
          // Path edit mode has its own entry action; setToolMode exits it.
          pathEditState: mode === 'edit-path' ? s.pathEditState : null,
          selectedIds: mode === 'pen' ? [] : s.selectedIds,
          editingBooleanId: mode === 'pen' ? null : s.editingBooleanId,
        })),

      penBeginAnchor: (x, y) =>
        set((s) => {
          if (s.toolMode !== 'pen') return s
          const draft = s.penDraft ?? { segments: [], pending: null, cursor: null }
          return { penDraft: { ...draft, pending: { x, y } } }
        }),

      penUpdatePendingHandle: (dx, dy, breakSymmetry) =>
        set((s) => {
          if (s.toolMode !== 'pen' || !s.penDraft || !s.penDraft.pending) return s
          const handleOut = { dx, dy }
          const pending: PenDraftSegment = breakSymmetry
            ? { ...s.penDraft.pending, handleOut }
            : { ...s.penDraft.pending, handleOut, handleIn: { dx: -dx, dy: -dy } }
          return { penDraft: { ...s.penDraft, pending } }
        }),

      penFinalizePending: () =>
        set((s) => {
          if (s.toolMode !== 'pen' || !s.penDraft || !s.penDraft.pending) return s
          return {
            penDraft: {
              ...s.penDraft,
              segments: [...s.penDraft.segments, s.penDraft.pending],
              pending: null,
            },
          }
        }),

      penUndoLastAnchor: () =>
        set((s) => {
          if (s.toolMode !== 'pen' || !s.penDraft) return s
          // Pending takes priority — clear it before popping a finalized one.
          if (s.penDraft.pending) {
            return { penDraft: { ...s.penDraft, pending: null } }
          }
          if (s.penDraft.segments.length === 0) return s
          return {
            penDraft: { ...s.penDraft, segments: s.penDraft.segments.slice(0, -1) },
          }
        }),

      penSetCursor: (x, y) =>
        set((s) => {
          if (s.toolMode !== 'pen' || !s.penDraft) return s
          return { penDraft: { ...s.penDraft, cursor: { x, y } } }
        }),

      penCommit: async (closed) => {
        const state = get()
        if (state.toolMode !== 'pen' || !state.penDraft) return null
        const segs = state.penDraft.segments
        if (segs.length < 2) return null

        // paper.js builds the cubic-bezier path data with proper handles
        // and normalizes to (0, 0). The builder lives in its own module
        // so canvas-store doesn't statically import paper — this keeps
        // paper.js out of the initial bundle's static graph.
        const { buildPenPathData } = await import('@/composition/pen-path-builder')
        const built = buildPenPathData(segs, closed)
        const { data } = built
        const bounds = built.bounds
        const width = Math.max(1, bounds.width)
        const height = Math.max(1, bounds.height)

        const node: PathNode = {
          id: newId(),
          type: 'path',
          name: 'Path',
          locked: false,
          hidden: false,
          x: bounds.x,
          y: bounds.y,
          rotation: 0,
          opacity: 1,
          data,
          fill: closed ? solidFill('#f4f4f5') : null,
          stroke: closed ? null : solidFill('#0a0a0a'),
          strokeWidth: closed ? 0 : 2,
          width,
          height,
        }

        set((s) => ({
          nodes: [...s.nodes, node],
          selectedIds: [node.id],
          penDraft: null,
          toolMode: 'select',
        }))
        return node.id
      },

      penCancel: () =>
        set({
          penDraft: null,
          toolMode: 'select',
        }),

      enterPathEdit: (nodeId) => {
        const state = get()
        const n = state.nodes.find((x) => x.id === nodeId)
        if (!n || n.type !== 'path') return
        set({
          toolMode: 'edit-path',
          pathEditState: { nodeId, selectedSegmentIndices: [] },
          selectedIds: [nodeId],
          penDraft: null,
          editingBooleanId: null,
        })
      },

      setPathEditSelectedIndices: (indices) =>
        set((s) => {
          if (!s.pathEditState) return s
          return { pathEditState: { ...s.pathEditState, selectedSegmentIndices: indices } }
        }),

      exitPathEdit: () =>
        set({
          toolMode: 'select',
          pathEditState: null,
        }),

      enterImageCrop: (nodeId) => {
        const state = get()
        const n = state.nodes.find((x) => x.id === nodeId)
        if (!n || n.type !== 'asset') return
        // Re-entry always starts in Rect mode (per IMAGE-CROP-V2). If the
        // node already has a rect crop, surface it; otherwise seed with a
        // full-image rect. Path crops show as the existing render but the
        // initial draft is a fresh full-image rect — switching to Polygon
        // / Lasso clears it for a fresh trace.
        const draft: ImageCropRect =
          n.crop && n.crop.kind === 'rect'
            ? { ...n.crop }
            : { kind: 'rect', x: 0, y: 0, width: n.width, height: n.height, rotation: 0 }
        set({
          toolMode: 'crop-image',
          cropEditState: { nodeId, mode: 'rect', draft },
          selectedIds: [nodeId],
          penDraft: null,
          pathEditState: null,
          editingBooleanId: null,
        })
      },

      setCropMode: (mode) => {
        const state = get()
        if (!state.cropEditState) return
        const n = state.nodes.find((x) => x.id === state.cropEditState!.nodeId)
        if (!n || n.type !== 'asset') return
        const draft: ImageCropRect | CropPathDraft =
          mode === 'rect'
            ? { kind: 'rect', x: 0, y: 0, width: n.width, height: n.height, rotation: 0 }
            : { kind: 'path', points: [], closed: false }
        set({
          cropEditState: { ...state.cropEditState, mode, draft },
        })
      },

      updateCropDraft: (patch) =>
        set((s) => {
          if (!s.cropEditState) return s
          const cur = s.cropEditState.draft
          // Patches are always partial-of-the-current-kind; switching shape
          // happens via setCropMode. Merge in place.
          if (cur.kind === 'rect') {
            return {
              cropEditState: {
                ...s.cropEditState,
                draft: { ...cur, ...(patch as Partial<ImageCropRect>) },
              },
            }
          }
          return {
            cropEditState: {
              ...s.cropEditState,
              draft: { ...cur, ...(patch as Partial<CropPathDraft>) },
            },
          }
        }),

      applyCrop: () => {
        const state = get()
        if (!state.cropEditState) return
        const { nodeId, draft } = state.cropEditState
        const committed = finalizeCropDraft(draft)
        set((s) => ({
          nodes: committed
            ? s.nodes.map((n) =>
                n.id === nodeId && n.type === 'asset' ? { ...n, crop: committed } : n,
              )
            : s.nodes,
          toolMode: 'select',
          cropEditState: null,
        }))
      },

      cancelCrop: () =>
        set({
          toolMode: 'select',
          cropEditState: null,
        }),

      resetCrop: (nodeId) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId && n.type === 'asset' ? { ...n, crop: null } : n,
          ),
        })),

      alignSelection: (edge, toArtboard = false) => {
        const state = get()
        const ids = state.selectedIds.filter((id) => {
          const n = state.nodes.find((x) => x.id === id)
          return n && !n.locked
        })
        if (ids.length === 0) return
        // Artboard anchor works for any selection size; selection anchor needs >=2.
        if (!toArtboard && ids.length < 2) return
        const childrenOf = new Map<string | undefined, CanvasNode[]>()
        for (const n of state.nodes) {
          const arr = childrenOf.get(n.parentId)
          if (arr) arr.push(n)
          else childrenOf.set(n.parentId, [n])
        }
        const anchor = toArtboard
          ? { x: 0, y: 0, width: state.stageWidth, height: state.stageHeight }
          : getSelectionBbox(state.nodes, ids, childrenOf)
        if (!anchor) return

        const patches = new Map<string, { x: number; y: number }>()
        for (const id of ids) {
          const n = state.nodes.find((x) => x.id === id)
          if (!n) continue
          const bbox = getNodeBbox(n)
          if (!bbox) continue
          let dx = 0
          let dy = 0
          switch (edge) {
            case 'left':
              dx = anchor.x - bbox.x
              break
            case 'hcenter':
              dx = anchor.x + anchor.width / 2 - (bbox.x + bbox.width / 2)
              break
            case 'right':
              dx = anchor.x + anchor.width - (bbox.x + bbox.width)
              break
            case 'top':
              dy = anchor.y - bbox.y
              break
            case 'vcenter':
              dy = anchor.y + anchor.height / 2 - (bbox.y + bbox.height / 2)
              break
            case 'bottom':
              dy = anchor.y + anchor.height - (bbox.y + bbox.height)
              break
          }
          if (dx !== 0 || dy !== 0) {
            patches.set(id, { x: n.x + dx, y: n.y + dy })
          }
        }
        if (patches.size === 0) return
        set((s) => {
          const next = s.nodes.map((n) => {
            const p = patches.get(n.id)
            return p ? ({ ...n, x: p.x, y: p.y } as CanvasNode) : n
          })
          return { nodes: invalidateBooleanAncestors(next, patches.keys()) }
        })
      },

      distributeSelection: (axis) => {
        const state = get()
        const targets = state.selectedIds
          .map((id) => state.nodes.find((x) => x.id === id))
          .filter((n): n is CanvasNode => !!n && !n.locked)
        if (targets.length < 3) return

        const entries = targets
          .map((n) => ({ n, b: getNodeBbox(n) }))
          .filter((e): e is { n: CanvasNode; b: NonNullable<ReturnType<typeof getNodeBbox>> } => !!e.b)
        if (entries.length < 3) return

        // Sort along the distribution axis by bbox origin
        entries.sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))

        const first = entries[0].b
        const last = entries[entries.length - 1].b
        const totalSpan = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
        const totalSize = entries.reduce(
          (sum, e) => sum + (axis === 'h' ? e.b.width : e.b.height),
          0,
        )
        const gap = (totalSpan - totalSize) / (entries.length - 1)

        const patches = new Map<string, { x: number; y: number }>()
        let cursor = axis === 'h' ? first.x + first.width + gap : first.y + first.height + gap
        for (let i = 1; i < entries.length - 1; i++) {
          const { n, b } = entries[i]
          const targetPos = cursor
          const delta = targetPos - (axis === 'h' ? b.x : b.y)
          if (delta !== 0) {
            patches.set(n.id, {
              x: axis === 'h' ? n.x + delta : n.x,
              y: axis === 'v' ? n.y + delta : n.y,
            })
          }
          cursor += (axis === 'h' ? b.width : b.height) + gap
        }
        if (patches.size === 0) return
        set((s) => {
          const next = s.nodes.map((n) => {
            const p = patches.get(n.id)
            return p ? ({ ...n, x: p.x, y: p.y } as CanvasNode) : n
          })
          return { nodes: invalidateBooleanAncestors(next, patches.keys()) }
        })
      },

      ungroupBoolean: (id) => {
        const state = get()
        const boolean = state.nodes.find((n) => n.id === id && n.type === 'boolean') as
          | BooleanNode
          | undefined
        if (!boolean) return
        const rad = (boolean.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const childIds: string[] = []
        const next = state.nodes.flatMap((n) => {
          if (n.id === id) return []
          if (n.parentId === id) {
            childIds.push(n.id)
            const rx = n.x * cos - n.y * sin
            const ry = n.x * sin + n.y * cos
            return [
              {
                ...n,
                x: boolean.x + rx,
                y: boolean.y + ry,
                rotation: n.rotation + boolean.rotation,
                parentId: boolean.parentId,
              } as CanvasNode,
            ]
          }
          return [n]
        })
        set({ nodes: next, selectedIds: childIds })
      },

      toggleSelect: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((i) => i !== id)
            : [...s.selectedIds, id],
        })),

      clearSelection: () => set({ selectedIds: [] }),

      selectAll: () =>
        set((s) => ({ selectedIds: s.nodes.filter((n) => !n.locked && !n.hidden).map((n) => n.id) })),

      nudgeSelected: (dx, dy) =>
        set((s) => {
          const sel = new Set(s.selectedIds)
          const next = s.nodes.map((n) =>
            sel.has(n.id) && !n.locked ? { ...n, x: n.x + dx, y: n.y + dy } : n,
          )
          return { nodes: invalidateBooleanAncestors(next, sel) }
        }),

      setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
      setViewportSize: (width, height) =>
        set((s) =>
          s.viewportSize.width === width && s.viewportSize.height === height
            ? s
            : { viewportSize: { width, height } },
        ),

      setStageSize: (w, h) => set({ stageWidth: w, stageHeight: h }),

      setPaletteSeed: (hex) => set({ palette: generatePalette(hex) }),

      setPalette: (palette) => set({ palette }),

      setArtboardBackground: (hex) => set({ artboardBackground: hex }),

      requestFit: () => set((s) => ({ fitRequestId: s.fitRequestId + 1 })),

      replaceState: ({ nodes, stageWidth, stageHeight, palette }) =>
        set((s) => ({
          nodes,
          stageWidth,
          stageHeight,
          palette: palette ?? s.palette,
          selectedIds: [],
          editingBooleanId: null,
          fitRequestId: s.fitRequestId + 1,
        })),

      // Effects live on the node's `effects` array (optional, defaults to
      // []). Effects are render-only — they don't change geometry, so we
      // skip invalidateBooleanAncestors on these mutations.
      addEffect: (nodeId, effect) =>
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const current = n.effects ?? []
            // Cap at 8: beyond this, the SVG filter chain gets pathological
            // and the canvas preview is already an approximation.
            if (current.length >= 8) return n
            return { ...n, effects: [...current, effect] } as CanvasNode
          }),
        })),

      updateEffect: (nodeId, index, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const effects = n.effects ?? []
            if (index < 0 || index >= effects.length) return n
            const merged = { ...effects[index], ...patch } as Effect
            const arr = effects.slice()
            arr[index] = merged
            return { ...n, effects: arr } as CanvasNode
          }),
        })),

      removeEffect: (nodeId, index) =>
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const effects = n.effects ?? []
            if (index < 0 || index >= effects.length) return n
            const arr = effects.slice()
            arr.splice(index, 1)
            return { ...n, effects: arr.length ? arr : undefined } as CanvasNode
          }),
        })),

      reorderEffect: (nodeId, from, to) =>
        set((s) => {
          if (from === to) return s
          return {
            nodes: s.nodes.map((n) => {
              if (n.id !== nodeId) return n
              const effects = n.effects ?? []
              if (from < 0 || from >= effects.length) return n
              if (to < 0 || to >= effects.length) return n
              const arr = effects.slice()
              const [moved] = arr.splice(from, 1)
              arr.splice(to, 0, moved)
              return { ...n, effects: arr } as CanvasNode
            }),
          }
        }),

      // In-place node swap. Preserves the array index (z-order) of the
      // replaced node and selects the topmost replacement. When given a
      // single CanvasNode, that node inherits the previous parentId. When
      // given an array, the caller is responsible for setting parentIds —
      // the array order is preserved (children before parent containers,
      // matching the canvas-store z-order convention). Boolean ancestors
      // that depended on the previous geometry are invalidated.
      replaceNode: (id, next) =>
        set((s) => {
          const idx = s.nodes.findIndex((n) => n.id === id)
          if (idx < 0) return s
          const prev = s.nodes[idx]
          const replacements = Array.isArray(next)
            ? next
            : [{ ...next, parentId: prev.parentId } as CanvasNode]
          if (replacements.length === 0) return s
          const arr = [...s.nodes]
          arr.splice(idx, 1, ...replacements)
          const top = replacements[replacements.length - 1]
          return {
            nodes: invalidateBooleanAncestors(arr, replacements.map((r) => r.id)),
            selectedIds: [top.id],
          }
        }),

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      setActiveProjectName: (name) => set({ activeProjectName: name }),
    }),
    {
      partialize: (s) => ({
        nodes: s.nodes,
        stageWidth: s.stageWidth,
        stageHeight: s.stageHeight,
        artboardBackground: s.artboardBackground,
      }) as never,
      limit: 100,
      equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    },
  ),
)

export function useTemporalStore<T>(selector: (state: ReturnType<typeof useCanvasStore.temporal.getState>) => T) {
  return useStore(useCanvasStore.temporal, selector)
}
