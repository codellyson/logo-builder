import type { BooleanCache, BooleanNode, CanvasNode } from '@/canvas/types'
import { ensureInit } from '@/composition/paper-bridge'
import { buildCtx, nodeToWorldPath } from '@/composition/node-to-path'

// PathItem is inferred from nodeToWorldPath's return type — avoids importing paper
// at runtime (which fires noUnusedLocals since we only use instance methods here).
type PathItem = NonNullable<Awaited<ReturnType<typeof nodeToWorldPath>>>

export async function evaluateBoolean(
  booleanId: string,
  nodes: CanvasNode[],
): Promise<BooleanCache | null> {
  ensureInit()

  const boolean = nodes.find((n) => n.id === booleanId && n.type === 'boolean') as
    | BooleanNode
    | undefined
  if (!boolean) return null

  const children = nodes.filter((n) => n.parentId === booleanId && !n.hidden)
  if (children.length < 2) return null

  const ctx = buildCtx(nodes)
  const paths: PathItem[] = []
  for (const c of children) {
    const p = await nodeToWorldPath(c, ctx)
    if (p) paths.push(p)
  }
  if (paths.length < 2) {
    for (const p of paths) p.remove()
    return null
  }

  let result: PathItem | null = null
  try {
    if (boolean.op === 'subtract') {
      const base = paths[0]
      let cutter: PathItem = paths[1]
      for (let i = 2; i < paths.length; i++) {
        const merged = cutter.unite(paths[i], { insert: false }) as PathItem
        cutter.remove()
        paths[i].remove()
        cutter = merged
      }
      result = base.subtract(cutter, { insert: false }) as PathItem
      base.remove()
      cutter.remove()
    } else {
      const opName = boolean.op // 'unite' | 'intersect' | 'exclude'
      let acc: PathItem = paths[0]
      for (let i = 1; i < paths.length; i++) {
        const next = paths[i]
        const combined =
          opName === 'unite'
            ? acc.unite(next, { insert: false })
            : opName === 'intersect'
              ? acc.intersect(next, { insert: false })
              : acc.exclude(next, { insert: false })
        acc.remove()
        next.remove()
        acc = combined as PathItem
      }
      result = acc
    }
  } catch (err) {
    console.warn('boolean eval failed', err)
    for (const p of paths) p.remove()
    if (result) (result as PathItem).remove()
    return null
  }

  if (!result || result.isEmpty()) {
    result?.remove()
    return null
  }

  const bounds = result.bounds
  const width = bounds.width
  const height = bounds.height
  const data = result.pathData
  result.remove()

  if (!data || width === 0 || height === 0) return null

  return {
    data,
    width,
    height,
    version: Date.now(),
  }
}
