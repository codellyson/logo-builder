import { db, type AssetKind, type AssetRecord } from '@/persistence/db'
import { newId } from '@/lib/id'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB cap; larger files are rejected at import.

const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const SVG_MIME = 'image/svg+xml'
const FONT_MIME = ['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-sfnt']
const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2']

export type AssetImportErrorCode = 'too-large' | 'unsupported' | 'parse-failed'

export class AssetImportError extends Error {
  readonly code: AssetImportErrorCode
  constructor(message: string, code: AssetImportErrorCode) {
    super(message)
    this.code = code
  }
}

export async function listAssets(): Promise<AssetRecord[]> {
  return db.assets.orderBy('updatedAt').reverse().toArray()
}

// Like listAssets but filtered to a single kind. Used by panels that only
// surface a subset (e.g. the assets panel hides fonts; the font picker only
// shows fonts).
export async function listAssetsByKind(kind: AssetKind): Promise<AssetRecord[]> {
  return db.assets.where('kind').equals(kind).reverse().sortBy('updatedAt')
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return db.assets.get(id)
}

export async function renameAsset(id: string, name: string): Promise<void> {
  await db.assets.update(id, {
    name: name.trim() || 'Untitled',
    updatedAt: Date.now(),
  })
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id)
}

// Imports a File into the assets store. Rejects oversized files, unsupported
// MIME types, and unparseable content. Derives natural dimensions on the
// way in so AssetNodes can place themselves at the asset's intrinsic size
// without re-decoding on every render.
export async function createAsset(file: File): Promise<AssetRecord> {
  if (file.size > MAX_BYTES) {
    throw new AssetImportError(
      `File is ${(file.size / 1024 / 1024).toFixed(1)}MB; max is ${MAX_BYTES / 1024 / 1024}MB.`,
      'too-large',
    )
  }
  const kind = detectKind(file)
  if (!kind) {
    throw new AssetImportError(`Unsupported file type: ${file.type || 'unknown'}.`, 'unsupported')
  }

  if (kind === 'font') {
    return createFontAsset(file)
  }

  const dims = await readDimensions(file, kind)
  const rec: AssetRecord = {
    id: newId(),
    name: stripExtension(file.name) || 'Untitled',
    kind,
    mimeType: file.type || (kind === 'svg' ? SVG_MIME : 'application/octet-stream'),
    blob: file,
    width: dims.width,
    height: dims.height,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.assets.put(rec)
  return rec
}

async function createFontAsset(file: File): Promise<AssetRecord> {
  const buffer = await file.arrayBuffer()
  let family: string | null = null
  try {
    const opentype = await import('opentype.js')
    const font = opentype.parse(buffer)
    // names.fontFamily is a localized record { en: '...', ... }; pick en or
    // first available. Fall back to file stem if metadata is empty.
    const names = font.names.fontFamily ?? {}
    family = names.en ?? Object.values(names)[0] ?? null
  } catch (err) {
    throw new AssetImportError(
      `Could not parse font file: ${(err as Error).message || 'unknown error'}`,
      'parse-failed',
    )
  }
  const fileStem = stripExtension(file.name)
  const resolvedFamily = (family && family.trim()) || fileStem || 'Custom Font'
  const rec: AssetRecord = {
    id: newId(),
    name: resolvedFamily,
    kind: 'font',
    mimeType: file.type || 'application/octet-stream',
    blob: file,
    width: 0,
    height: 0,
    fontFamily: resolvedFamily,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.assets.put(rec)
  return rec
}

function detectKind(file: File): AssetKind | null {
  const mime = file.type
  if (mime === SVG_MIME) return 'svg'
  if (IMAGE_MIME.includes(mime)) return 'image'
  if (FONT_MIME.includes(mime)) return 'font'
  // Some browsers don't set a font MIME type — fall back to extension.
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && FONT_EXT.includes(ext)) return 'font'
  return null
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

type Dimensions = { width: number; height: number }

async function readDimensions(file: File, kind: AssetKind): Promise<Dimensions> {
  if (kind === 'image') return readRasterDimensions(file)
  if (kind === 'svg') return readSvgDimensions(file)
  return { width: 0, height: 0 }
}

// Loads the raster into an HTMLImageElement to read naturalWidth / naturalHeight.
// Object URL is revoked after load resolves.
function readRasterDimensions(file: File): Promise<Dimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      if (dims.width === 0 || dims.height === 0) {
        reject(new AssetImportError('Image has zero dimensions.', 'parse-failed'))
        return
      }
      resolve(dims)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AssetImportError('Failed to decode image.', 'parse-failed'))
    }
    img.src = url
  })
}

// Reads an SVG file's viewBox to derive intrinsic dimensions. Falls back to
// the `width`/`height` attributes if no viewBox is present, then to a
// 100×100 default if neither attribute is parseable. Doesn't validate the
// SVG body — that's the renderer's job.
async function readSvgDimensions(file: File): Promise<Dimensions> {
  const text = await file.text()
  const viewBox = text.match(/viewBox\s*=\s*"([^"]+)"/)
  if (viewBox) {
    const parts = viewBox[1].split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , w, h] = parts
      if (w > 0 && h > 0) return { width: w, height: h }
    }
  }
  const widthAttr = text.match(/<svg[^>]*\swidth\s*=\s*"([^"]+)"/)
  const heightAttr = text.match(/<svg[^>]*\sheight\s*=\s*"([^"]+)"/)
  const w = widthAttr ? parseFloat(widthAttr[1]) : NaN
  const h = heightAttr ? parseFloat(heightAttr[1]) : NaN
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h }
  }
  return { width: 100, height: 100 }
}
