import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { ColorPicker } from '@/colors/color-picker'
import { solidFill } from '@/composition/fills'
import { ROLE_LABELS, ROLE_ORDER, generatePalette, type PaletteRole } from '@/colors/palette'

export function PalettePanel() {
  const palette = useCanvasStore((s) => s.palette)
  const setPaletteSeed = useCanvasStore((s) => s.setPaletteSeed)
  const setPalette = useCanvasStore((s) => s.setPalette)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const updateNode = useCanvasStore((s) => s.updateNode)
  const nodes = useCanvasStore((s) => s.nodes)
  const [seedOpen, setSeedOpen] = useState(true)

  const applyRoleToSelection = (role: PaletteRole) => {
    const hex = palette[role]
    for (const id of selectedIds) {
      const n = nodes.find((x) => x.id === id)
      if (!n) continue
      if (n.type === 'line') updateNode(id, { stroke: solidFill(hex) })
      else if ('fill' in n) updateNode(id, { fill: solidFill(hex) })
    }
  }

  return (
    <div className="border-t border-neutral-800">
      <button
        type="button"
        onClick={() => setSeedOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
      >
        <span>Palette</span>
        <Icon icon={seedOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'} width={12} height={12} />
      </button>
      {seedOpen && (
        <div className="space-y-3 px-3 pb-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              Seed
            </div>
            <ColorPicker
              value={palette.seed}
              onChange={(hex) => {
                if (hex) setPaletteSeed(hex)
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              Roles <span className="text-neutral-600">(click to apply)</span>
            </div>
            <div className="space-y-1">
              {ROLE_ORDER.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyRoleToSelection(role)}
                    className="h-6 w-6 shrink-0 rounded border border-neutral-800 hover:ring-1 hover:ring-neutral-400"
                    style={{ background: palette[role] }}
                    title={`Apply ${ROLE_LABELS[role]} to selection`}
                  />
                  <span className="flex-1 text-xs text-neutral-300">{ROLE_LABELS[role]}</span>
                  <ColorPicker
                    value={palette[role]}
                    onChange={(hex) => {
                      if (hex) setPalette({ ...palette, [role]: hex })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPalette(generatePalette(palette.seed))}
            className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Regenerate from seed
          </button>
        </div>
      )}
    </div>
  )
}
