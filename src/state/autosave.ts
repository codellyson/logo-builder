import { useEffect } from 'react'
import { useCanvasStore } from '@/state/canvas-store'
import type { CanvasNode } from '@/canvas/types'
import type { Palette } from '@/colors/palette'

const STORAGE_KEY = 'logo-builder:autosave:v1'
const DEBOUNCE_MS = 500

// Bumped from 1 → 2 when `fill: string` became `fill: Fill` (gradients sprint
// phase 1). Older snapshots can't be safely loaded — node types diverge — so
// the load path rejects them with a console warning and the user gets a fresh
// editor. Old data sits orphaned in localStorage; greenfield, no migration.
const SCHEMA_VERSION = 2

type Snapshot = {
  version?: number
  nodes: CanvasNode[]
  stageWidth: number
  stageHeight: number
  palette?: Palette
  artboardBackground?: string
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Snapshot
    if (!parsed || !Array.isArray(parsed.nodes)) return null
    if (parsed.version !== SCHEMA_VERSION) {
      console.warn(
        `[logo-builder] ignoring autosave at schema v${parsed.version ?? 1}; current is v${SCHEMA_VERSION}. Starting fresh.`,
      )
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveSnapshot(snap: Snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snap, version: SCHEMA_VERSION }))
  } catch {
    // ignore quota errors
  }
}

export function useAutosave() {
  useEffect(() => {
    let timer: number | undefined
    const unsub = useCanvasStore.subscribe((state, prev) => {
      if (
        state.nodes === prev.nodes &&
        state.stageWidth === prev.stageWidth &&
        state.stageHeight === prev.stageHeight &&
        state.palette === prev.palette &&
        state.artboardBackground === prev.artboardBackground
      )
        return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        saveSnapshot({
          nodes: state.nodes,
          stageWidth: state.stageWidth,
          stageHeight: state.stageHeight,
          palette: state.palette,
          artboardBackground: state.artboardBackground,
        })
      }, DEBOUNCE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [])
}

export function restoreSnapshotOnMount() {
  const snap = loadSnapshot()
  if (!snap) return
  useCanvasStore.getState().replaceState(snap)
  if (snap.artboardBackground) {
    useCanvasStore.getState().setArtboardBackground(snap.artboardBackground)
  }
  useCanvasStore.temporal.getState().clear()
}
