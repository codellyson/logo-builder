import Dexie, { type Table } from 'dexie'
import type { CanvasNode } from '@/canvas/types'
import type { Palette } from '@/colors/palette'

// Bumped on each schema-breaking change. v2 added Fill (gradients sprint),
// v3 widened stroke to Fill (stroke gradients), v4 promoted snapshots from
// the old localStorage shape into a versioned ProjectSnapshot with
// artboardBackground included, v5 added the `'asset'` node variant. v4 →
// v5 is non-destructive (a v4 project loads cleanly into v5 code, just
// without any asset nodes), so the load path auto-upgrades v4 snapshots
// in place rather than rejecting them.
export const SCHEMA_VERSION = 7

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

// Cross-project assets. Image and SVG kinds carry an opaque Blob; SVG
// records also expose viewBox-derived dimensions so AssetNodes can size
// themselves on placement without re-parsing. `'font'` is reserved for
// phase 6 of the assets sprint.
export type AssetKind = 'image' | 'svg' | 'font'

export type AssetRecord = {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  blob: Blob
  width: number
  height: number
  // Font-only: parsed family name (used as the picker label). Optional so
  // image/svg records don't carry it.
  fontFamily?: string
  createdAt: number
  updatedAt: number
}

export type PaletteRecord = {
  id: string
  name: string
  palette: Palette
  createdAt: number
  updatedAt: number
}

class LogoBuilderDB extends Dexie {
  projects!: Table<ProjectRecord, string>
  assets!: Table<AssetRecord, string>
  palettes!: Table<PaletteRecord, string>

  constructor() {
    super('logo-builder')
    // v(1) shipped with the project-management sprint. v(2) adds the
    // assets and palettes stores. Dexie carries forward existing project
    // records automatically — no per-row migration needed.
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    })
    this.version(2).stores({
      projects: 'id, name, updatedAt',
      assets: 'id, name, kind, updatedAt',
      palettes: 'id, name, updatedAt',
    })
  }
}

export const db = new LogoBuilderDB()
