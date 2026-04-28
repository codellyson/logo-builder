import { Icon } from '@iconify/react'

export function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center text-ink-4">
        <Icon icon="lucide:arrow-left" width={18} height={18} className="text-ink-4" />
        <div className="text-sm">Pick a tool from the left to add something.</div>
        <div className="text-[11px] text-ink-4">
          Rectangle, ellipse, line, text, or icon. Press <kbd className="rounded border border-line-strong bg-surface-2 px-1 py-0.5 font-mono text-[10px]">?</kbd> for shortcuts.
        </div>
      </div>
    </div>
  )
}
