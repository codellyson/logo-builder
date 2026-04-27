import { useEffect } from 'react'
import { useCanvasStore } from '@/state/canvas-store'
import { ensureActiveProject, getActiveProjectId } from '@/persistence/active-project'
import { updateProject } from '@/persistence/projects'
import { SCHEMA_VERSION, type ProjectSnapshot } from '@/persistence/db'

const DEBOUNCE_MS = 500

// Builds a snapshot from the current store state. Pulled out of useAutosave
// so the project switcher can call it just before a switch to flush
// pending edits into the outgoing project's record.
export function snapshotFromStore(state = useCanvasStore.getState()): ProjectSnapshot {
  return {
    version: SCHEMA_VERSION,
    nodes: state.nodes,
    stageWidth: state.stageWidth,
    stageHeight: state.stageHeight,
    palette: state.palette,
    artboardBackground: state.artboardBackground,
  }
}

// Subscribes to the canvas store and debounces writes to the *active*
// project's IndexedDB record. Replaces the old single-slot localStorage
// autosave. If there's no active project (shouldn't happen after
// `restoreActiveProjectOnMount`), the autosave is a no-op.
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
      ) {
        return
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const id = getActiveProjectId()
        if (!id) return
        // Fire-and-forget; errors here are non-fatal (quota, transient db
        // state). Logged via the IndexedDB error path.
        void updateProject(id, snapshotFromStore(state))
      }, DEBOUNCE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [])
}

// On app boot: resolve or create the active project, push it into the
// canvas store, and clear the temporal (undo) history so the user can't
// undo through a project boundary.
export async function restoreActiveProjectOnMount(): Promise<void> {
  const rec = await ensureActiveProject()
  const store = useCanvasStore.getState()
  store.replaceState({
    nodes: rec.snapshot.nodes,
    stageWidth: rec.snapshot.stageWidth,
    stageHeight: rec.snapshot.stageHeight,
    palette: rec.snapshot.palette,
  })
  store.setArtboardBackground(rec.snapshot.artboardBackground)
  store.setActiveProjectId(rec.id)
  store.setActiveProjectName(rec.name)
  useCanvasStore.temporal.getState().clear()
}
