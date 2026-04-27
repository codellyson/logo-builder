import { useEffect, useRef, type ReactNode } from 'react'
import { Group } from 'react-konva'
import Konva from 'konva'
import type { CanvasNode, Effect } from '@/canvas/types'

// Returns the radius of the topmost enabled blur effect, or null.
export function findEnabledBlur(effects: Effect[] | undefined): number | null {
  if (!effects) return null
  for (let i = effects.length - 1; i >= 0; i--) {
    const eff = effects[i]
    if (eff.type === 'blur' && eff.enabled && eff.radius > 0) return eff.radius
  }
  return null
}

// Wraps `children` in a Konva Group with a Gaussian blur filter applied
// via cache(). The cache rebuilds whenever `radius` or `cacheKey` change
// — pass a string derived from the underlying node's geometry props so
// repositioning a blurred node redraws the cache instead of leaving a
// stale snapshot.
function BlurWrapper({
  radius,
  cacheKey,
  children,
}: {
  radius: number
  cacheKey: string
  children: ReactNode
}) {
  const ref = useRef<Konva.Group | null>(null)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    g.filters([Konva.Filters.Blur])
    g.blurRadius(radius)
    // cache() must run after children mount; React Konva mounts children
    // before parents in commit phase, so by useEffect time the children
    // are present.
    g.cache()
    g.getLayer()?.batchDraw()
    return () => {
      g.clearCache()
    }
  }, [radius, cacheKey])
  return <Group ref={ref}>{children}</Group>
}

// Wraps `children` in a BlurWrapper if the node has an enabled blur effect,
// otherwise returns children as-is. Centralizes the blur dispatch so call
// sites in the renderTree don't need conditional logic.
export function MaybeBlur({
  node,
  children,
}: {
  node: CanvasNode
  children: ReactNode
}) {
  const radius = findEnabledBlur(node.effects)
  if (!radius) return <>{children}</>
  // cacheKey covers what would change the rendered cache: position is
  // moot (the wrapper isn't placed by it), but everything else that could
  // alter the rasterized output. Stringifying the whole node is wasteful
  // but fine for v1 — nodes are small.
  return (
    <BlurWrapper radius={radius} cacheKey={JSON.stringify(node)}>
      {children}
    </BlurWrapper>
  )
}
