import { useEffect, useState } from 'react'
import type { CanvasNode } from '@/canvas/types'
import { serializeSvg } from '@/export/svg-serializer'

type Props = {
  node: CanvasNode
  size?: number
}

type Bbox = { x: number; y: number; width: number; height: number }

function getNodeLocalBbox(n: CanvasNode): Bbox {
  if (n.type === 'group') return { x: 0, y: 0, width: 1, height: 1 }
  if (n.type === 'rect') return { x: 0, y: 0, width: n.width, height: n.height }
  if (n.type === 'ellipse')
    return { x: -n.radiusX, y: -n.radiusY, width: n.radiusX * 2, height: n.radiusY * 2 }
  if (n.type === 'polygon')
    return { x: -n.radius, y: -n.radius, width: n.radius * 2, height: n.radius * 2 }
  if (n.type === 'star')
    return {
      x: -n.outerRadius,
      y: -n.outerRadius,
      width: n.outerRadius * 2,
      height: n.outerRadius * 2,
    }
  if (n.type === 'text') return { x: 0, y: 0, width: n.width, height: n.fontSize * 1.25 }
  if (n.type === 'icon') return { x: 0, y: 0, width: n.width, height: n.height }
  if (n.type === 'path') return { x: 0, y: 0, width: n.width, height: n.height }
  if (n.type === 'line') {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < n.points.length; i += 2) {
      xs.push(n.points[i])
      ys.push(n.points[i + 1])
    }
    if (xs.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const pad = n.strokeWidth
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + 2 * pad,
      height: maxY - minY + 2 * pad,
    }
  }
  return { x: 0, y: 0, width: 1, height: 1 }
}

export function LayerThumbnail({ node, size = 24 }: Props) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (node.type === 'group') {
      setSvg(null)
      return
    }
    let cancelled = false
    const bbox = getNodeLocalBbox(node)
    const w = Math.max(1, bbox.width)
    const h = Math.max(1, bbox.height)
    const temp: CanvasNode = {
      ...node,
      x: -bbox.x,
      y: -bbox.y,
      rotation: 0,
      blendMode: undefined,
      opacity: 1,
    } as CanvasNode
    serializeSvg({ nodes: [temp], width: w, height: h })
      .then((s) => {
        if (!cancelled) setSvg(s)
      })
      .catch(() => {
        if (!cancelled) setSvg(null)
      })
    return () => {
      cancelled = true
    }
  }, [node])

  const cleaned = svg
    ? svg
        .replace(/ width="[^"]+"/, '')
        .replace(/ height="[^"]+"/, '')
        .replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%" ')
    : null

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-800"
      style={{ width: size, height: size }}
    >
      {cleaned && (
        <div
          className="flex h-full w-full items-center justify-center p-0.5"
          dangerouslySetInnerHTML={{ __html: cleaned }}
        />
      )}
    </div>
  )
}
