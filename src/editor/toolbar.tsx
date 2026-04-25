import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { createByType, type PrimitiveType } from '@/canvas/factories'
import { cn } from '@/lib/cn'

const TOOLS: Array<{ type: PrimitiveType; icon: string; label: string }> = [
  { type: 'rect', icon: 'lucide:square', label: 'Rectangle' },
  { type: 'ellipse', icon: 'lucide:circle', label: 'Ellipse' },
  { type: 'triangle', icon: 'lucide:triangle', label: 'Triangle' },
  { type: 'polygon', icon: 'lucide:pentagon', label: 'Polygon' },
  { type: 'star', icon: 'lucide:star', label: 'Star' },
  { type: 'line', icon: 'lucide:minus', label: 'Line' },
  { type: 'text', icon: 'lucide:type', label: 'Text' },
  { type: 'icon', icon: 'lucide:shapes', label: 'Icon' },
]

export function Toolbar() {
  const addNode = useCanvasStore((s) => s.addNode)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const toolMode = useCanvasStore((s) => s.toolMode)
  const setToolMode = useCanvasStore((s) => s.setToolMode)

  const onAdd = (type: PrimitiveType) => {
    if (toolMode === 'pen') setToolMode('select')
    const existing = useCanvasStore.getState().nodes.length
    const step = 24
    const offset = (existing % 6) * step - step * 2.5
    addNode(createByType(type, stageWidth / 2 + offset, stageHeight / 2 + offset))
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-md border border-neutral-800 bg-neutral-950/95 p-1 shadow-lg backdrop-blur">
      <button
        type="button"
        title={toolMode === 'pen' ? 'Exit Pen (V)' : 'Pen (P)'}
        onClick={() => setToolMode(toolMode === 'pen' ? 'select' : 'pen')}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded',
          toolMode === 'pen'
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
        )}
      >
        <Icon icon="lucide:pen-tool" width={16} height={16} />
      </button>
      <div className="my-0.5 h-px bg-neutral-800" />
      {TOOLS.map((t) => (
        <button
          key={t.type}
          type="button"
          title={t.label}
          onClick={() => onAdd(t.type)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded text-neutral-400',
            'hover:bg-neutral-800 hover:text-neutral-100',
          )}
        >
          <Icon icon={t.icon} width={16} height={16} />
        </button>
      ))}
    </div>
  )
}
