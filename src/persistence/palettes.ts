import { db, type PaletteRecord } from '@/persistence/db'
import type { Palette } from '@/colors/palette'
import { newId } from '@/lib/id'

export async function listPalettes(): Promise<PaletteRecord[]> {
  return db.palettes.orderBy('updatedAt').reverse().toArray()
}

export async function getPalette(id: string): Promise<PaletteRecord | undefined> {
  return db.palettes.get(id)
}

// Saves a snapshot of the given palette under `name`. Saved palettes are
// immutable from the source's perspective — editing the project palette
// after saving doesn't update the saved record. Re-save under the same
// name to overwrite (replaces the record at that name; otherwise creates).
export async function savePalette(name: string, palette: Palette): Promise<PaletteRecord> {
  const trimmed = name.trim() || 'Untitled palette'
  const existing = await db.palettes.where('name').equals(trimmed).first()
  if (existing) {
    const updated: PaletteRecord = {
      ...existing,
      palette,
      updatedAt: Date.now(),
    }
    await db.palettes.put(updated)
    return updated
  }
  const rec: PaletteRecord = {
    id: newId(),
    name: trimmed,
    palette,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.palettes.put(rec)
  return rec
}

export async function renamePalette(id: string, name: string): Promise<void> {
  await db.palettes.update(id, {
    name: name.trim() || 'Untitled palette',
    updatedAt: Date.now(),
  })
}

export async function deletePalette(id: string): Promise<void> {
  await db.palettes.delete(id)
}
