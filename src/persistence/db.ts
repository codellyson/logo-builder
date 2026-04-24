import Dexie, { type Table } from 'dexie'
import type { CanvasNode } from '@/canvas/types'
import type { Palette } from '@/colors/palette'

export type ProjectSnapshot = {
  nodes: CanvasNode[]
  stageWidth: number
  stageHeight: number
  palette: Palette
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
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    })
  }
}

export const db = new LogoBuilderDB()
