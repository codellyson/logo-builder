import { useCanvasStore } from '@/state/canvas-store'
import {
  createEmptyProject,
  createProjectFromSnapshot,
  ensureActiveProject,
  setActiveProjectId as persistActiveId,
} from '@/persistence/active-project'
import {
  deleteProject as deleteProjectRecord,
  duplicateProject,
  getProject,
  renameProject,
} from '@/persistence/projects'
import type { ProjectRecord } from '@/persistence/db'
import { instantiateTemplate, type Template } from '@/templates/registry'

// Loads a project record into the canvas store, switches the active id,
// and clears the temporal history (you can't undo across project
// boundaries — the past states reference nodes that no longer exist).
export function activateProject(rec: ProjectRecord): void {
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
  persistActiveId(rec.id)
  useCanvasStore.temporal.getState().clear()
}

// Reload the active project record from IndexedDB and re-activate. Useful
// after an out-of-band rename so the in-memory mirror stays fresh.
export async function reloadActiveProjectName(): Promise<void> {
  const id = useCanvasStore.getState().activeProjectId
  if (!id) return
  const rec = await getProject(id)
  if (rec) useCanvasStore.getState().setActiveProjectName(rec.name)
}

// Renames the active project in the DB and updates the store mirror.
// No-op if there's no active id or the new name is identical.
export async function renameActiveProject(name: string): Promise<void> {
  const id = useCanvasStore.getState().activeProjectId
  const trimmed = name.trim() || 'Untitled'
  if (!id) {
    useCanvasStore.getState().setActiveProjectName(trimmed)
    return
  }
  await renameProject(id, trimmed)
  useCanvasStore.getState().setActiveProjectName(trimmed)
}

export async function createAndActivateNewProject(name = 'Untitled'): Promise<ProjectRecord> {
  const rec = await createEmptyProject(name)
  activateProject(rec)
  return rec
}

// Picks a template, swaps in the user's brand name, and creates +
// activates a new project from it. The project's name defaults to the
// brand name (so the projects list is searchable by what the user typed)
// and falls back to the template's display name.
export async function createAndActivateFromTemplate(
  template: Template,
  options: { brandName: string; paletteSeed?: string },
): Promise<ProjectRecord> {
  const snapshot = instantiateTemplate(template, options)
  const projectName = options.brandName.trim() || template.name
  const rec = await createProjectFromSnapshot(projectName, snapshot)
  activateProject(rec)
  return rec
}

// Duplicates the active project (full snapshot copy) and switches to the
// copy so the user can keep editing without disturbing the original.
export async function duplicateActiveProject(): Promise<ProjectRecord | null> {
  const id = useCanvasStore.getState().activeProjectId
  if (!id) return null
  const copy = await duplicateProject(id)
  if (!copy) return null
  activateProject(copy)
  return copy
}

// Deletes the active project, then falls through to the next available
// project (most recent at current schema version) or a fresh "Untitled"
// via `ensureActiveProject`.
export async function deleteActiveProject(): Promise<void> {
  const id = useCanvasStore.getState().activeProjectId
  if (!id) return
  await deleteProjectRecord(id)
  persistActiveId(null)
  const next = await ensureActiveProject()
  activateProject(next)
}
