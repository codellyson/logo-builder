import Dexie, { type Table } from 'dexie'
import type { CanvasNode } from '@/canvas/types'
import type { Palette } from '@/colors/palette'

// Bumped on each schema-breaking change. v2 added Fill (gradients sprint),
// v3 widened stroke to Fill (stroke gradients), v4 promoted snapshots from
// the old localStorage shape into a versioned ProjectSnapshot with
// artboardBackground included. Older project records can't be safely
// loaded — node types diverge — so the load path rejects them with a
// console warning and falls through to creating a fresh project.
export const SCHEMA_VERSION = 4

export type ProjectSnapshot = {
  version: number
  nodes: CanvasNode[]
  stageWidth: number
  stageHeight: number
  palette: Palette
  artboardBackground: string
}

export type ProjectRecord = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  snapshot: ProjectSnapshot
}

class LogoBuilderDB extends Dexie {
  projects!: Table<ProjectRecord, string>

  constructor() {
    super('logo-builder')
    // The dexie schema only indexes top-level fields; the snapshot blob is
    // opaque JSON, so adding fields inside ProjectSnapshot doesn't require
    // a dexie version bump. SCHEMA_VERSION above governs that separately.
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    })
  }
}

export const db = new LogoBuilderDB()
