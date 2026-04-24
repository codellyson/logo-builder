import { create } from 'zustand'
import { temporal } from 'zundo'
import { useStore } from 'zustand'
import type { BooleanCache, BooleanNode, BooleanOp, CanvasNode, GroupNode, PathNode, Viewport } from '@/canvas/types'
import { newId } from '@/lib/id'
import { DEFAULT_PALETTE, generatePalette, type Palette } from '@/colors/palette'

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
  palette: Palette
  artboardBackground: string
  fitRequestId: number
  editingBooleanId: string | null
}

type CanvasActions = {
  addNode: (node: CanvasNode) => void
  updateNode: (id: string, patch: Partial<CanvasNode>) => void
  removeNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => void
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
  selectAll: () => void
  nudgeSelected: (dx: number, dy: number) => void
  setViewport: (v: Partial<Viewport>) => void
  setStageSize: (w: number, h: number) => void
  setPaletteSeed: (hex: string) => void
  setPalette: (palette: Palette) => void
  setArtboardBackground: (hex: string) => void
  requestFit: () => void
  replaceState: (
    snapshot: Pick<CanvasState, 'nodes' | 'stageWidth' | 'stageHeight'> & { palette?: Palette },
  ) => void
}

const initialState: CanvasState = {
  nodes: [],
  selectedIds: [],
  stageWidth: 800,
  stageHeight: 800,
  viewport: { x: 0, y: 0, scale: 1 },
  palette: DEFAULT_PALETTE,
  artboardBackground: '#ffffff',
  fitRequestId: 0,
  editingBooleanId: null,
}

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node], selectedIds: [node.id] })),

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
          return {
            nodes: invalidateBooleanAncestors(filtered, parentIdsOfRemoved, { includeSelf: true }),
            selectedIds: s.selectedIds.filter((i) => !toRemove.has(i)),
            editingBooleanId:
              s.editingBooleanId && toRemove.has(s.editingBooleanId) ? null : s.editingBooleanId,
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

        let fill: string | null = '#000000'
        let stroke: string | null = null
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
