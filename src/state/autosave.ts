import { useEffect } from 'react'
import { useCanvasStore } from '@/state/canvas-store'
import type { CanvasNode } from '@/canvas/types'
import type { Palette } from '@/colors/palette'

const STORAGE_KEY = 'logo-builder:autosave:v1'
const DEBOUNCE_MS = 500

type Snapshot = {
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
    return parsed
  } catch {
    return null
  }
}

export function saveSnapshot(snap: Snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
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
