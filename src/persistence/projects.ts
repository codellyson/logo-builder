import { db, type ProjectRecord, type ProjectSnapshot } from '@/persistence/db'
import { newId } from '@/lib/id'

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function saveAsProject(name: string, snapshot: ProjectSnapshot): Promise<ProjectRecord> {
  const rec: ProjectRecord = {
    id: newId(),
    name: name.trim() || 'Untitled',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshot,
  }
  await db.projects.put(rec)
  return rec
}

export async function updateProject(id: string, snapshot: ProjectSnapshot): Promise<void> {
  await db.projects.update(id, { snapshot, updatedAt: Date.now() })
}

export async function renameProject(id: string, name: string): Promise<void> {
  await db.projects.update(id, { name: name.trim() || 'Untitled', updatedAt: Date.now() })
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
}

export async function duplicateProject(id: string): Promise<ProjectRecord | null> {
  const src = await db.projects.get(id)
  if (!src) return null
  const copy: ProjectRecord = {
    ...src,
    id: newId(),
    name: `${src.name} copy`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.projects.put(copy)
  return copy
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  return db.projects.get(id)
}
