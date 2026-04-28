import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/cn'

export type MenuItem =
  | { kind?: 'item'; label: string; icon?: string; shortcut?: string; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { kind: 'separator' }

type Props = {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const menuW = 200
  const menuH = items.length * 26 + 12
  const left = Math.min(x, vw - menuW - 8)
  const top = Math.min(y, vh - menuH - 8)

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 60, width: menuW }}
      className="rounded-md border border-line bg-surface py-1 shadow-xl"
    >
      {items.map((it, i) => {
        if (it.kind === 'separator') {
          return <div key={i} className="my-1 border-t border-line" />
        }
        return (
          <button
            key={i}
            type="button"
            disabled={it.disabled}
            onClick={() => {
              it.onClick()
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1 text-left text-xs',
              it.danger ? 'text-red-400 hover:bg-red-500/20' : 'text-ink hover:bg-surface-3',
              it.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
            )}
          >
            {it.icon && <Icon icon={it.icon} width={12} height={12} />}
            <span className="flex-1">{it.label}</span>
            {it.shortcut && (
              <span className="font-mono text-[10px] text-ink-4">{it.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
