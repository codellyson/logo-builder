import { Icon } from '@iconify/react'

type Props = {
  onClose: () => void
}

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Selection',
    rows: [
      ['Click', 'Select layer'],
      ['Shift / Cmd + Click', 'Add to selection'],
      ['Drag on empty', 'Marquee select'],
      ['Cmd / Ctrl + A', 'Select all'],
      ['Esc', 'Clear selection'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      ['Drag', 'Move'],
      ['Arrow keys', 'Nudge 1px'],
      ['Shift + Arrow', 'Nudge 10px'],
      ['Double-click text', 'Edit content'],
      ['Cmd / Ctrl + D', 'Duplicate'],
      ['Delete / Backspace', 'Delete'],
    ],
  },
  {
    title: 'History & View',
    rows: [
      ['Cmd / Ctrl + Z', 'Undo'],
      ['Cmd / Ctrl + Shift + Z', 'Redo'],
      ['Scroll', 'Pan'],
      ['Cmd + Scroll / Pinch', 'Zoom'],
      ['?', 'Toggle this panel'],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['P', 'Pen tool'],
      ['V', 'Return to select'],
      ['Enter', 'Commit pen path as open'],
      ['Click first anchor', 'Commit pen path as closed'],
      ['Backspace (drafting)', 'Pop last anchor'],
      ['Shift (placing)', 'Constrain to 0° / 45° / 90°'],
      ['Alt (drag handle)', 'Break handle symmetry'],
      ['A', 'Edit path (on a selected path)'],
      ['Double-click path', 'Edit path'],
      ['Double-click on edge', 'Insert anchor'],
      ['Cmd + A (edit mode)', 'Select all anchors'],
      ['Arrows (edit mode)', 'Nudge anchors 1px (Shift = 10px)'],
      ['Delete / Backspace', 'Remove selected anchor(s)'],
      ['1 / 2 / 3', 'Anchor style: corner / smooth / cusp'],
    ],
  },
  {
    title: 'Composition',
    rows: [
      ['Cmd + G', 'Group'],
      ['Cmd + Shift + G', 'Ungroup'],
      ['Cmd + Alt + U', 'Boolean: Union'],
      ['Cmd + Alt + S', 'Boolean: Subtract'],
      ['Cmd + Alt + I', 'Boolean: Intersect'],
      ['Cmd + Alt + X', 'Boolean: Exclude'],
      ['Cmd + Shift + E', 'Flatten boolean'],
      ['Double-click boolean', 'Enter / exit edit mode'],
    ],
  },
  {
    title: 'Align & Distribute',
    rows: [
      ['Alt + L / C / R', 'Align left / center-H / right'],
      ['Alt + T / M / B', 'Align top / middle-V / bottom'],
      ['Alt + H / V', 'Distribute horizontal / vertical'],
      ['+ Shift', 'Align to artboard'],
    ],
  },
]

export function ShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="text-sm font-medium">Keyboard shortcuts</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
                {g.title}
              </div>
              <div className="space-y-1">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-400">{v}</span>
                    <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                      {k}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
