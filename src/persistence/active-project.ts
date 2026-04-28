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
// version. Compatible-but-older snapshots (currently v4 → v5) are
// auto-upgraded in place: we rewrite the version field and persist. This
// is safe when the schema bump is purely additive (a new node variant)
// and existing nodes deserialize unchanged. Does not create anything —
// see ensureActiveProject.
export async function loadActiveProject(): Promise<ProjectRecord | null> {
  const id = getActiveProjectId()
  if (!id) return null
  const rec = await db.projects.get(id)
  if (!rec) {
    setActiveProjectId(null)
    return null
  }
  const upgraded = await maybeUpgradeSnapshot(rec)
  if (!upgraded) {
    console.warn(
      `[logo-builder] active project "${rec.name}" is at schema v${rec.snapshot.version}; current is v${SCHEMA_VERSION}. Falling through.`,
    )
    return null
  }
  return upgraded
}

// Upgrades a project record's snapshot in place if the bump is non-breaking,
// or returns null if the snapshot is at a schema we can't load.
//
// Non-breaking history:
//  - v4 → v5: added 'asset' node variant. v4 records simply have no assets.
//  - v5 → v6: added optional `effects` field on NodeBase. v5 records have
//    no effects, which loads as `undefined` and renders identically.
//  - v6 → v7: added optional `lockupRole` on Group / Boolean. v6 records
//    have no roles; export variants fall back to the heuristic.
//
// All upgrades just rewrite the version field; no shape migration needed.
async function maybeUpgradeSnapshot(rec: ProjectRecord): Promise<ProjectRecord | null> {
  const v = rec.snapshot.version
  if (v === SCHEMA_VERSION) return rec
  if (isLoadableVersion(v)) {
    const upgraded: ProjectRecord = {
      ...rec,
      updatedAt: Date.now(),
      snapshot: { ...rec.snapshot, version: SCHEMA_VERSION },
    }
    await db.projects.put(upgraded)
    return upgraded
  }
  return null
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

  // Most-recent project at a loadable schema (current OR auto-upgradeable).
  // Activating it routes through loadActiveProject, which performs the
  // upgrade if needed.
  const all = await db.projects.orderBy('updatedAt').reverse().toArray()
  const candidate = all.find((p) => isLoadableVersion(p.snapshot.version))
  if (candidate) {
    setActiveProjectId(candidate.id)
    const loaded = await loadActiveProject()
    if (loaded) return loaded
  }

  const fresh = await createEmptyProject('Untitled')
  setActiveProjectId(fresh.id)
  return fresh
}

function isLoadableVersion(v: number): boolean {
  // Mirrors maybeUpgradeSnapshot's accepted set: the current version, plus
  // any version we know how to migrate forward in place.
  return v === SCHEMA_VERSION || v === 4 || v === 5 || v === 6
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

// Persists a project from a pre-built snapshot. Used by the templates
// flow — the template registry hands us an instantiated snapshot, we
// rewrite each node id to a fresh value (so two pickings of the same
// template don't share ids) and save.
export async function createProjectFromSnapshot(
  name: string,
  snapshot: ProjectSnapshot,
): Promise<ProjectRecord> {
  const idMap = new Map<string, string>()
  for (const n of snapshot.nodes) idMap.set(n.id, newId())
  const remappedNodes = snapshot.nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id)!,
    parentId: n.parentId ? idMap.get(n.parentId) : undefined,
  }))
  const now = Date.now()
  const rec: ProjectRecord = {
    id: newId(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    snapshot: { ...snapshot, nodes: remappedNodes, version: SCHEMA_VERSION },
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
