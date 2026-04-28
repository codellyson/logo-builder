import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/cn'

type Pos = { x: number; y: number }

const STORAGE_PREFIX = 'builty.panel.'

function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}.pos`
}

function readStoredPos(name: string): Pos | null {
  try {
    const raw = localStorage.getItem(storageKey(name))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

function writeStoredPos(name: string, pos: Pos): void {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(pos))
  } catch {
    // Quota / disabled storage — silently no-op. Position is still in
    // component state for the rest of the session.
  }
}

// Clears every panel's stored position. Called from the Reset toolbars
// menu item; broadcasts a custom event so mounted DraggablePanels reset
// their state without a page reload.
const RESET_EVENT = 'builty.panel.reset'

export function resetPanelPositions(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k)
  }
  window.dispatchEvent(new CustomEvent(RESET_EVENT))
}

type Props = {
  // Stable id used as the localStorage key. Changing this loses persisted
  // position — treat it like a schema version.
  name: string
  // Style applied when the user hasn't dragged the panel yet. Lets each
  // panel preserve its design-time anchor (right/bottom/center/etc.)
  // without forcing the wrapper to compute pixel coords on mount.
  defaultStyle: CSSProperties
  className?: string
  children: ReactNode
}

export function DraggablePanel({ name, defaultStyle, className, children }: Props) {
  const [pos, setPos] = useState<Pos | null>(() => readStoredPos(name))
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    panelStartX: number
    panelStartY: number
  } | null>(null)

  useEffect(() => {
    const onReset = () => setPos(null)
    window.addEventListener(RESET_EVENT, onReset)
    return () => window.removeEventListener(RESET_EVENT, onReset)
  }, [])

  const onGripPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const el = ref.current
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    // Snapshot the panel's current rendered position so dragging picks up
    // exactly where it sits — no jump from CSS-anchored default to pixel
    // coords on first drag.
    const rect = el.getBoundingClientRect()
    const parent = el.offsetParent as HTMLElement | null
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const panelStartX = rect.left - parentRect.left
    const panelStartY = rect.top - parentRect.top
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panelStartX,
      panelStartY,
    }
    setPos({ x: panelStartX, y: panelStartY })

    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const next = {
        x: d.panelStartX + (ev.clientX - d.startX),
        y: d.panelStartY + (ev.clientY - d.startY),
      }
      setPos(next)
    }
    const up = () => {
      const final = dragRef.current
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (final) {
        // Persist the current state value, not the start — `pos` already
        // tracks the latest move via setPos.
        const el = ref.current
        if (el) {
          const r = el.getBoundingClientRect()
          const p = el.offsetParent as HTMLElement | null
          const pr = p?.getBoundingClientRect() ?? { left: 0, top: 0 }
          writeStoredPos(name, { x: r.left - pr.left, y: r.top - pr.top })
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const style: CSSProperties = pos
    ? { position: 'absolute', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : defaultStyle

  return (
    <div ref={ref} style={style} className={cn('pointer-events-auto group relative', className)}>
      {children}
      <button
        type="button"
        title="Drag to move"
        onPointerDown={onGripPointerDown}
        // Hover-revealed grip — sits above the panel so it doesn't fight
        // the panel's own padding/border. Visible on hover or while
        // actively dragging (the parent group:hover style covers both).
        className="absolute -top-3 left-1/2 flex h-5 w-7 -translate-x-1/2 cursor-grab items-center justify-center rounded-t-md border border-b-0 border-line bg-surface/95 text-ink-4 opacity-0 shadow-md transition-opacity hover:text-ink active:cursor-grabbing group-hover:opacity-100"
      >
        <Icon icon="lucide:grip-horizontal" width={12} height={12} />
      </button>
    </div>
  )
}
