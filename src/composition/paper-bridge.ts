import paper from 'paper'

let initialized = false

export function ensureInit() {
  if (initialized) return
  paper.setup(new paper.Size(1024, 1024))
  initialized = true
}

export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude'

function parsePath(d: string): paper.PathItem {
  return new paper.CompoundPath({ pathData: d, insert: false })
}

export function booleanOp(paths: string[], op: BooleanOp): string | null {
  ensureInit()
  if (paths.length < 2) return null
  try {
    let result = parsePath(paths[0])
    for (let i = 1; i < paths.length; i++) {
      const next = parsePath(paths[i])
      const combined =
        op === 'unite'
          ? result.unite(next, { insert: false })
          : op === 'subtract'
            ? result.subtract(next, { insert: false })
            : op === 'intersect'
              ? result.intersect(next, { insert: false })
              : result.exclude(next, { insert: false })
      result.remove()
      next.remove()
      result = combined as paper.PathItem
    }
    const data = result.pathData
    result.remove()
    return data
  } catch (err) {
    console.warn('boolean op failed', err)
    return null
  }
}

export function pathBounds(d: string): { x: number; y: number; width: number; height: number } {
  ensureInit()
  try {
    const p = parsePath(d)
    const b = p.bounds
    p.remove()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
}

export function translatePath(d: string, dx: number, dy: number): string {
  ensureInit()
  try {
    const p = parsePath(d)
    p.translate(new paper.Point(dx, dy))
    const data = p.pathData
    p.remove()
    return data
  } catch {
    return d
  }
}

export function scalePath(d: string, sx: number, sy: number): string {
  ensureInit()
  try {
    const p = parsePath(d)
    p.scale(sx, sy, new paper.Point(0, 0))
    const data = p.pathData
    p.remove()
    return data
  } catch {
    return d
  }
}

export function simplifyPath(d: string): string {
  ensureInit()
  try {
    const p = parsePath(d)
    const reduced = p.reduce({})
    const data = (reduced as paper.PathItem).pathData
    p.remove()
    if (p !== reduced) (reduced as paper.PathItem).remove()
    return data
  } catch {
    return d
  }
}
