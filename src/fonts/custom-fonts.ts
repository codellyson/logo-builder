import type { AssetRecord } from '@/persistence/db'
import { listAssetsByKind } from '@/persistence/assets'

// In-memory registry: family name → { record, blobUrl }. blobUrl resolves to
// the stored Blob via URL.createObjectURL — we hold one URL per family and
// reuse it for both FontFace registration and text-to-outlines fetches.
type CustomFontEntry = {
  record: AssetRecord
  blobUrl: string
  fontFace: FontFace
}

const registry = new Map<string, CustomFontEntry>()

export type CustomFontInfo = {
  family: string
  record: AssetRecord
}

export function listCustomFonts(): CustomFontInfo[] {
  return Array.from(registry.values()).map((e) => ({
    family: e.record.fontFamily ?? e.record.name,
    record: e.record,
  }))
}

// Returns a blob URL for the font's bytes, or null if the family isn't
// registered. Used by the text-outlining path so opentype.js can fetch the
// font via the same FONT_FILE_URLS-style indirection.
export function customFontUrl(family: string): string | null {
  return registry.get(family)?.blobUrl ?? null
}

// Registers a single font asset with the FontFace API and remembers it in
// the in-memory registry. Idempotent: re-registering an existing family
// replaces the prior FontFace and revokes the old blob URL.
export async function registerCustomFont(record: AssetRecord): Promise<void> {
  if (record.kind !== 'font') return
  const family = record.fontFamily ?? record.name
  if (!family) return

  const previous = registry.get(family)
  if (previous) {
    document.fonts.delete(previous.fontFace)
    URL.revokeObjectURL(previous.blobUrl)
  }

  const blobUrl = URL.createObjectURL(record.blob)
  const fontFace = new FontFace(family, `url(${blobUrl})`)
  await fontFace.load()
  document.fonts.add(fontFace)
  registry.set(family, { record, blobUrl, fontFace })
}

// Unregisters a font, revokes its blob URL, removes the FontFace entry.
// Called by the font picker's delete action.
export function unregisterCustomFont(family: string): void {
  const entry = registry.get(family)
  if (!entry) return
  document.fonts.delete(entry.fontFace)
  URL.revokeObjectURL(entry.blobUrl)
  registry.delete(family)
}

// Loads every persisted font asset and registers each via FontFace. Called
// once at app boot so saved text layers can render and re-outline using
// custom fonts without needing a re-upload.
export async function bootCustomFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const records = await listAssetsByKind('font')
  await Promise.allSettled(records.map(registerCustomFont))
}
