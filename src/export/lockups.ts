import type { CanvasNode } from '@/canvas/types'

export type LockupVariant = 'original' | 'icon-only' | 'wordmark-only' | 'mono-dark' | 'mono-light'

export function deriveVariant(nodes: CanvasNode[], variant: LockupVariant): CanvasNode[] {
  if (variant === 'original') return nodes
  if (variant === 'icon-only') {
    return nodes.filter((n) => n.type === 'icon' || n.type === 'path' || n.type === 'ellipse' || n.type === 'rect')
  }
  if (variant === 'wordmark-only') {
    return nodes.filter((n) => n.type === 'text')
  }
  if (variant === 'mono-dark') {
    return nodes.map((n) => recolor(n, '#0a0a0a'))
  }
  return nodes.map((n) => recolor(n, '#ffffff'))
}

function recolor(n: CanvasNode, target: string): CanvasNode {
  if (n.type === 'rect') return { ...n, fill: target, stroke: n.stroke ? target : null }
  if (n.type === 'ellipse') return { ...n, fill: target, stroke: n.stroke ? target : null }
  if (n.type === 'line') return { ...n, stroke: target }
  if (n.type === 'text') return { ...n, fill: target }
  if (n.type === 'icon') return { ...n, fill: target }
  if (n.type === 'path') return { ...n, fill: n.fill ? target : null, stroke: n.stroke ? target : null }
  return n
}
