import { DEFAULT_PALETTE } from '@/colors/palette'
import { newId } from '@/lib/id'
import {
  db,
  SCHEMA_VERSION,
  type ProjectRecord,
  type ProjectSnapshot,
} from '@/persistence/db'

const ACTIVE_KEY = 'logo-builder:active-project'
// Pre-v4 autosave slot. Read once on first run to seed a "Recovered" project,
// then deleted so subsequent loads use IndexedDB exclusively. After this
// migration window, the key is irrelevant.
const LEGACY_AUTOSAVE_KEY = 'logo-builder:autosave:v1'

export function getActiveProjectId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveProjectId(id: string | null): void {
  if (typeof localStorage === 'undefined') return
  if (id === null) localStorage.removeItem(ACTIVE_KEY)
  else localStorage.setItem(ACTIVE_KEY, id)
}

// Returns the active project record, or null if no active id is set, the
// record doesn't exist, or its snapshot is at an incompatible schema
// version. Does not create anything — see ensureActiveProject.
export async function loadActiveProject(): Promise<ProjectRecord | null> {
  const id = getActiveProjectId()
  if (!id) return null
  const rec = await db.projects.get(id)
  if (!rec) {
    setActiveProjectId(null)
    return null
  }
  if (rec.snapshot.version !== SCHEMA_VERSION) {
    console.warn(
      `[logo-builder] active project "${rec.name}" is at schema v${rec.snapshot.version}; current is v${SCHEMA_VERSION}. Falling through.`,
    )
    return null
  }
  return rec
}

// Always returns a valid active project. Order of preference:
// 1. The id stored in localStorage, if it resolves and the snapshot version
//    matches.
// 2. A migration from the legacy `logo-builder:autosave:v1` localStorage
//    entry — read once, written into a "Recovered" project, then the legacy
//    key is removed so we never re-import.
// 3. The most-recently-updated existing project at the current schema
//    version.
// 4. A fresh, empty "Untitled" project.
export async function ensureActiveProject(): Promise<ProjectRecord> {
  const existing = await loadActiveProject()
  if (existing) return existing

  const recovered = await tryRecoverFromLegacyAutosave()
  if (recovered) {
    setActiveProjectId(recovered.id)
    return recovered
  }

  const all = await db.projects.orderBy('updatedAt').reverse().toArray()
  const compat = all.find((p) => p.snapshot.version === SCHEMA_VERSION)
  if (compat) {
    setActiveProjectId(compat.id)
    return compat
  }

  const fresh = await createEmptyProject('Untitled')
  setActiveProjectId(fresh.id)
  return fresh
}

export async function createEmptyProject(name: string): Promise<ProjectRecord> {
  const now = Date.now()
  const rec: ProjectRecord = {
    id: newId(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    snapshot: emptySnapshot(),
  }
  await db.projects.put(rec)
  return rec
}

function emptySnapshot(): ProjectSnapshot {
  return {
    version: SCHEMA_VERSION,
    nodes: [],
    stageWidth: 800,
    stageHeight: 800,
    palette: DEFAULT_PALETTE,
    artboardBackground: '#ffffff',
  }
}

// One-shot legacy import. The pre-v4 autosave wrote a different shape (no
// version field, no artboardBackground guarantee). We try to read it, build
// a compatible v4 snapshot, save it as a "Recovered" project, and remove the
// legacy key so we never run this twice.
async function tryRecoverFromLegacyAutosave(): Promise<ProjectRecord | null> {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectSnapshot> & { version?: number }
    // Only attempt recovery if the legacy snapshot's version matches the
    // current schema. If it's older, the node shapes have moved and we can't
    // safely deserialize.
    if (parsed.version !== SCHEMA_VERSION - 1 && parsed.version !== SCHEMA_VERSION) {
      localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
      return null
    }
    if (!Array.isArray(parsed.nodes)) {
      localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
      return null
    }
    const now = Date.now()
    const rec: ProjectRecord = {
      id: newId(),
      name: 'Recovered',
      createdAt: now,
      updatedAt: now,
      snapshot: {
        version: SCHEMA_VERSION,
        nodes: parsed.nodes,
        stageWidth: parsed.stageWidth ?? 800,
        stageHeight: parsed.stageHeight ?? 800,
        palette: parsed.palette ?? DEFAULT_PALETTE,
        artboardBackground: parsed.artboardBackground ?? '#ffffff',
      },
    }
    await db.projects.put(rec)
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
    return rec
  } catch {
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
    return null
  }
}
