import { SCHEMA_VERSION, type ProjectSnapshot } from '@/persistence/db'

// Wire format for `.idan` files. The header lets a stray reader sniff
// the file (otherwise it's just JSON) and lets future schema bumps land
// without silently mis-parsing older payloads. The `snapshot` object is
// the same shape autosave writes to IndexedDB.
export type IdanFile = {
  format: 'idan'
  version: number
  snapshot: ProjectSnapshot
}

export class IdanLoadError extends Error {}

export function buildIdanFile(snapshot: ProjectSnapshot): IdanFile {
  return { format: 'idan', version: SCHEMA_VERSION, snapshot }
}

// Triggers a browser download of the snapshot wrapped in an Idan envelope.
// File name is derived from the project name with a `.idan` extension.
export function downloadIdanFile(name: string, snapshot: ProjectSnapshot): void {
  const file = buildIdanFile(snapshot)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(name)}.idan`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Reads and validates an `.idan` file. Throws IdanLoadError with a
// human-readable message on any parse / shape / version failure so the
// caller can surface it without sniffing error types. Returns the
// snapshot plus a default project name (the file's basename) — the
// caller decides whether to use it or prompt the user.
export async function readIdanFile(file: File): Promise<{ name: string; snapshot: ProjectSnapshot }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new IdanLoadError("Couldn't read the file — invalid JSON.")
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new IdanLoadError('Not an Idan project file.')
  }
  const obj = parsed as Partial<IdanFile>
  if (obj.format !== 'idan') {
    throw new IdanLoadError('Not an Idan project file.')
  }
  if (typeof obj.version !== 'number') {
    throw new IdanLoadError('File is missing a version header.')
  }
  if (obj.version > SCHEMA_VERSION) {
    throw new IdanLoadError(
      `This file is from a newer version of Idan (v${obj.version}). Update the app to open it.`,
    )
  }
  const snap = obj.snapshot
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.nodes)) {
    throw new IdanLoadError('File is missing project data.')
  }
  return { name: file.name.replace(/\.idan$/i, ''), snapshot: snap }
}

function slugify(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toLowerCase()
  return cleaned || 'project'
}
