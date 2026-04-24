import type { BooleanCache } from '@/canvas/types'
import { useCanvasStore } from '@/state/canvas-store'
import { evaluateBoolean } from '@/composition/evaluate-boolean'

const EMPTY_CACHE: BooleanCache = {
  data: '',
  width: 0,
  height: 0,
  version: 0,
}

let scheduled = false
const inFlight = new Set<string>()

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    void runEvals()
  })
}

async function runEvals() {
  const state = useCanvasStore.getState()
  const dirty = state.nodes.filter(
    (n) => n.type === 'boolean' && n.cache === null && !inFlight.has(n.id),
  )
  if (dirty.length === 0) return

  await Promise.all(
    dirty.map(async (b) => {
      inFlight.add(b.id)
      try {
        const snapshot = useCanvasStore.getState().nodes
        const cache = await evaluateBoolean(b.id, snapshot).catch((err) => {
          console.error('[boolean] evaluateBoolean threw', err)
          return null
        })
        const latest = useCanvasStore.getState().nodes.find((n) => n.id === b.id)
        if (!latest || latest.type !== 'boolean') return
        if (latest.cache !== null) return
        useCanvasStore.getState().setBooleanCache(b.id, cache ?? EMPTY_CACHE)
      } finally {
        inFlight.delete(b.id)
      }
    }),
  )

  // Re-check after eval in case invalidations happened while we were working
  const post = useCanvasStore.getState().nodes
  if (post.some((n) => n.type === 'boolean' && n.cache === null && !inFlight.has(n.id))) {
    schedule()
  }
}

export function startBooleanEvalRunner(): () => void {
  // Initial kick — if the store was restored with dirty booleans, evaluate them.
  schedule()
  const unsubscribe = useCanvasStore.subscribe((state, prev) => {
    if (state.nodes === prev.nodes) return
    const hasDirty = state.nodes.some(
      (n) => n.type === 'boolean' && n.cache === null && !inFlight.has(n.id),
    )
    if (hasDirty) schedule()
  })
  return unsubscribe
}
