import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { convertToPath } from '@/composition/to-path'
import { textToOutlines } from '@/composition/text-to-outlines'
import type { BooleanOp, CanvasNode } from '@/canvas/types'
import { cn } from '@/lib/cn'

export function CompositionToolbar() {
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const addNode = useCanvasStore((s) => s.addNode)
  const updateNode = useCanvasStore((s) => s.updateNode)
  const removeNodes = useCanvasStore((s) => s.removeNodes)
  const select = useCanvasStore((s) => s.select)
  const createBoolean = useCanvasStore((s) => s.createBoolean)

  const selected = nodes.filter((n) => selectedIds.includes(n.id))
  const canConvert = selected.some(
    (n) => n.type === 'rect' || n.type === 'ellipse' || n.type === 'line',
  )
  const hasText = selected.some((n) => n.type === 'text')

  // Boolean ops need >= 2 closed-region shapes sharing a parent. Lines are open paths and rejected.
  const sharedParentOk =
    selected.length >= 2 && new Set(selected.map((n) => n.parentId)).size === 1
  const canBool =
    sharedParentOk && selected.length >= 2 && selected.every((n) => n.type !== 'line')

  const runBoolean = (op: BooleanOp) => {
    if (!canBool) return
    const id = createBoolean(selectedIds, op)
    if (!id) console.warn('createBoolean rejected', { selectedIds, op })
  }

  const doConvertToPath = () => {
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

  const doTextToOutlines = async () => {
    const textSelections: CanvasNode[] = selected.filter((n) => n.type === 'text')
    const results: string[] = []
    for (const t of textSelections) {
      if (t.type !== 'text') continue
      const path = await textToOutlines(t)
      if (!path) {
        console.warn('text-to-outlines failed; font file unavailable', t.fontFamily)
        continue
      }
      addNode(path)
      updateNode(t.id, { hidden: true })
      results.push(path.id)
    }
    if (results.length) select(results)
  }

  return (
    <div className="pointer-events-auto flex gap-1 rounded-md border border-neutral-800 bg-neutral-950/95 p-1 shadow-lg backdrop-blur">
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
      <div className="mx-0.5 w-px bg-neutral-800" />
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
        'flex h-8 w-8 items-center justify-center rounded text-neutral-400',
        'hover:bg-neutral-800 hover:text-neutral-100',
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400',
      )}
    >
      <Icon icon={icon} width={15} height={15} />
    </button>
  )
}
