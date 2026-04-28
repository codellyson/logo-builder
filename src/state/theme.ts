import { useEffect, useSyncExternalStore } from 'react'

// Editor theme. Persists in localStorage and reflects onto
// <html data-theme="..."> so token CSS variables (defined in index.css)
// pick up the right palette. Default is dark — matches the historical
// editor look and what most design tools (Figma, Illustrator) ship.
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'builty.theme'
const DEFAULT_THEME: Theme = 'dark'

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // localStorage disabled — fall through.
  }
  return DEFAULT_THEME
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

const listeners = new Set<() => void>()
let current: Theme = readStoredTheme()
applyTheme(current)

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const l of listeners) l()
}

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme): void {
  if (theme === current) return
  current = theme
  applyTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persist failure is non-fatal — runtime state still flipped.
  }
  emit()
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

export function useTheme(): Theme {
  // useSyncExternalStore wires this to React with no extra ceremony —
  // any component that reads the theme re-renders on toggle.
  const value = useSyncExternalStore(subscribe, getTheme, getTheme)
  // Defensive: if the document gets re-mounted (rare, e.g. during HMR),
  // re-apply the data attribute so the CSS tokens stay in sync.
  useEffect(() => {
    applyTheme(value)
  }, [value])
  return value
}
