import { SCHEMA_VERSION, type ProjectSnapshot } from '@/persistence/db'

// Wire format for `.builty` files. The header lets a stray reader sniff
// the file (otherwise it's just JSON) and lets future schema bumps land
// without silently mis-parsing older payloads. The `snapshot` object is
// the same shape autosave writes to IndexedDB.
export type BuiltyFile = {
  format: 'builty'
  version: number
  snapshot: ProjectSnapshot
}

export class BuiltyLoadError extends Error {}

export function buildBuiltyFile(snapshot: ProjectSnapshot): BuiltyFile {
  return { format: 'builty', version: SCHEMA_VERSION, snapshot }
}

// Triggers a browser download of the snapshot wrapped in a Builty envelope.
// File name is derived from the project name with a `.builty` extension.
export function downloadBuiltyFile(name: string, snapshot: ProjectSnapshot): void {
  const file = buildBuiltyFile(snapshot)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(name)}.builty`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Reads and validates a `.builty` file. Throws BuiltyLoadError with a
// human-readable message on any parse / shape / version failure so the
// caller can surface it without sniffing error types. Returns the
// snapshot plus a default project name (the file's basename) — the
// caller decides whether to use it or prompt the user.
export async function readBuiltyFile(file: File): Promise<{ name: string; snapshot: ProjectSnapshot }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BuiltyLoadError("Couldn't read the file — invalid JSON.")
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BuiltyLoadError('Not a Builty project file.')
  }
  const obj = parsed as Partial<BuiltyFile>
  if (obj.format !== 'builty') {
    throw new BuiltyLoadError('Not a Builty project file.')
  }
  if (typeof obj.version !== 'number') {
    throw new BuiltyLoadError('File is missing a version header.')
  }
  if (obj.version > SCHEMA_VERSION) {
    throw new BuiltyLoadError(
      `This file is from a newer version of Builty (v${obj.version}). Update the app to open it.`,
    )
  }
  const snap = obj.snapshot
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.nodes)) {
    throw new BuiltyLoadError('File is missing project data.')
  }
  return { name: file.name.replace(/\.builty$/i, ''), snapshot: snap }
}

function slugify(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toLowerCase()
  return cleaned || 'project'
}
