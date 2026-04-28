import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

type Props = {
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  children: ReactNode | ((ctx: { close: () => void }) => ReactNode)
  align?: 'start' | 'end' | 'center'
  side?: 'top' | 'bottom'
  className?: string
}

export function Popover({ trigger, children, align = 'start', side = 'bottom', className }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const panelEl = panelRef.current
    const pw = panelEl?.offsetWidth ?? 240
    const ph = panelEl?.offsetHeight ?? 240

    let top = side === 'bottom' ? r.bottom + 6 : r.top - ph - 6
    let left: number
    if (align === 'start') left = r.left
    else if (align === 'end') left = r.right - pw
    else left = r.left + r.width / 2 - pw / 2

    // keep in viewport
    const vw = window.innerWidth
    const vh = window.innerHeight
    left = Math.max(8, Math.min(left, vw - pw - 8))
    top = Math.max(8, Math.min(top, vh - ph - 8))

    setPos({ top, left })
  }, [open, align, side])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const clonedTrigger = cloneElement(trigger, {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el
    },
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((v) => !v)
    },
  } as Record<string, unknown>)

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              opacity: pos ? 1 : 0,
            }}
            className={cn(
              'z-50 rounded-md border border-line bg-surface shadow-xl',
              className,
            )}
          >
            {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
          </div>,
          document.body,
        )}
    </>
  )
}
