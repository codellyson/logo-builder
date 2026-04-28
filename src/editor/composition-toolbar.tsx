import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { textToOutlineGlyphs } from '@/composition/text-to-outlines'
import type { BooleanOp, CanvasNode, GroupNode, PathNode, TextNode } from '@/canvas/types'
import { newId } from '@/lib/id'
import { cn } from '@/lib/cn'

export function CompositionToolbar() {
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const addNode = useCanvasStore((s) => s.addNode)
  const addNodes = useCanvasStore((s) => s.addNodes)
  const updateNode = useCanvasStore((s) => s.updateNode)
  const removeNodes = useCanvasStore((s) => s.removeNodes)
  const select = useCanvasStore((s) => s.select)
  const createBoolean = useCanvasStore((s) => s.createBoolean)

  const selected = nodes.filter((n) => selectedIds.includes(n.id))
  const canConvert = selected.some(
    (n) => n.type === 'rect' || n.type === 'ellipse' || n.type === 'line',
  )
  const hasText = selected.some((n) => n.type === 'text')
  // Only paths whose data has more than one M command can be split. Counting
  // here keeps the button correctly enabled/disabled without paying a paper
  // parse on every render.
  const canBreakApart = selected.some(
    (n) => n.type === 'path' && (n.data.match(/[Mm]/g) ?? []).length > 1,
  )

  // Boolean ops need 2+ shapes with fill or a positive-width stroke, sharing a parent.
  const sharedParentOk =
    selected.length >= 2 && new Set(selected.map((n) => n.parentId)).size === 1
  const hasGeometry = (n: CanvasNode) => {
    if ('fill' in n && n.fill) return true
    if ('stroke' in n && n.stroke && 'strokeWidth' in n && n.strokeWidth > 0) return true
    if (n.type === 'group' || n.type === 'boolean' || n.type === 'text' || n.type === 'icon')
      return true
    return false
  }
  const canBool = sharedParentOk && selected.length >= 2 && selected.every(hasGeometry)

  const runBoolean = (op: BooleanOp) => {
    if (!canBool) return
    const id = createBoolean(selectedIds, op)
    if (!id) console.warn('createBoolean rejected', { selectedIds, op })
  }

  const doConvertToPath = async () => {
    // Dynamic-imported so paper.js (used by translatePath / pathBounds)
    // stays out of the initial bundle.
    const { convertToPath } = await import('@/composition/convert-to-path')
    const newIds: string[] = []
    for (const n of selected) {
      if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'line') {
        const p = convertToPath(n)
        if (p) {
          addNode(p)
          removeNodes([n.id])
          newIds.push(p.id)
        }
      }
    }
    if (newIds.length) select(newIds)
  }

  const doBreakApart = async () => {
    const { splitSubpaths } = await import('@/composition/path-edit-ops')
    const newIds: string[] = []
    const toRemove: string[] = []
    for (const n of selected) {
      if (n.type !== 'path') continue
      const parts = splitSubpaths(n.data)
      if (parts.length < 2) continue
      const created: PathNode[] = parts.map((p, i) => ({
        ...n,
        id: newId(),
        name: `${n.name} ${i + 1}`,
        data: p.data,
        width: p.bbox.width,
        height: p.bbox.height,
      }))
      addNodes(created)
      toRemove.push(n.id)
      for (const c of created) newIds.push(c.id)
    }
    if (toRemove.length) removeNodes(toRemove)
    if (newIds.length) select(newIds)
  }

  const doTextToOutlines = async () => {
    const textSelections = selected.filter((n): n is TextNode => n.type === 'text')
    const rootIds: string[] = []
    for (const t of textSelections) {
      const glyphs = await textToOutlineGlyphs(t)
      if (!glyphs || glyphs.length === 0) {
        console.warn('text-to-outlines failed; font file unavailable', t.fontFamily)
        continue
      }
      // Single-glyph text (e.g. "A") collapses to a tight PathNode.
      // Multi-glyph text produces one PathNode per letter wrapped in a
      // Group, so each glyph is selectable / editable on its own.
      if (glyphs.length === 1) {
        const g = glyphs[0]
        const path: PathNode = {
          id: newId(),
          type: 'path',
          name: t.name,
          locked: false,
          hidden: false,
          x: t.x + g.x,
          y: t.y + g.y,
          rotation: t.rotation,
          opacity: t.opacity,
          blendMode: t.blendMode,
          parentId: t.parentId,
          data: g.data,
          fill: t.fill,
          stroke: null,
          strokeWidth: 0,
          width: g.width,
          height: g.height,
        }
        addNode(path)
        rootIds.push(path.id)
      } else {
        const group: GroupNode = {
          id: newId(),
          type: 'group',
          name: t.name,
          locked: false,
          hidden: false,
          x: t.x,
          y: t.y,
          rotation: t.rotation,
          opacity: t.opacity,
          blendMode: t.blendMode,
          parentId: t.parentId,
          collapsed: false,
        }
        const children: PathNode[] = glyphs.map((g) => ({
          id: newId(),
          type: 'path',
          name: 'Glyph',
          locked: false,
          hidden: false,
          x: g.x,
          y: g.y,
          rotation: 0,
          opacity: 1,
          parentId: group.id,
          data: g.data,
          fill: t.fill,
          stroke: null,
          strokeWidth: 0,
          width: g.width,
          height: g.height,
        }))
        addNodes([...children, group])
        rootIds.push(group.id)
      }
      updateNode(t.id, { hidden: true })
    }
    if (rootIds.length) select(rootIds)
  }

  return (
    <div className="pointer-events-auto flex gap-1 rounded-md border border-line bg-surface/95 p-1 shadow-lg backdrop-blur">
      <Tool icon="lucide:git-merge" title="Union" disabled={!canBool} onClick={() => runBoolean('unite')} />
      <Tool
        icon="lucide:git-branch"
        title="Subtract (bottom minus rest)"
        disabled={!canBool}
        onClick={() => runBoolean('subtract')}
      />
      <Tool
        icon="lucide:diamond"
        title="Intersect"
        disabled={!canBool}
        onClick={() => runBoolean('intersect')}
      />
      <Tool
        icon="lucide:x-circle"
        title="Exclude (XOR)"
        disabled={!canBool}
        onClick={() => runBoolean('exclude')}
      />
      <div className="mx-0.5 w-px bg-surface-3" />
      <Tool
        icon="lucide:spline"
        title="Convert to Path"
        disabled={!canConvert}
        onClick={doConvertToPath}
      />
      <Tool
        icon="lucide:type"
        title="Text → Outlines"
        disabled={!hasText}
        onClick={doTextToOutlines}
      />
      <Tool
        icon="lucide:scissors"
        title="Break apart subpaths"
        disabled={!canBreakApart}
        onClick={doBreakApart}
      />
    </div>
  )
}

function Tool({
  icon,
  title,
  disabled,
  onClick,
}: {
  icon: string
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded text-ink-3',
        'hover:bg-surface-3 hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3',
      )}
    >
      <Icon icon={icon} width={15} height={15} />
    </button>
  )
}
