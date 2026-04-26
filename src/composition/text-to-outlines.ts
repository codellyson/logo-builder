import opentype, { type Font } from 'opentype.js'
import type { PathNode, TextNode } from '@/canvas/types'
import { fontFileUrl } from '@/composition/font-urls'
import { newId } from '@/lib/id'

const fontCache = new Map<string, Promise<Font | null>>()

async function loadFont(family: string, weight: 400 | 700): Promise<Font | null> {
  const key = `${family}::${weight}`
  const cached = fontCache.get(key)
  if (cached) return cached
  const url = fontFileUrl(family, weight)
  if (!url) return null
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`font fetch failed: ${r.status}`)
      return r.arrayBuffer()
    })
    .then((buf) => opentype.parse(buf))
    .catch((err) => {
      console.warn('Failed to load font for outlines', family, weight, err)
      return null
    })
  fontCache.set(key, p)
  return p
}

export async function textToOutlines(node: TextNode): Promise<PathNode | null> {
  const weight: 400 | 700 = node.fontStyle.includes('bold') ? 700 : 400
  const font = await loadFont(node.fontFamily, weight)
  if (!font) return null

  const lines = node.text.split('\n')
  const lineHeight = node.fontSize * 1.2
  const combinedPath = new opentype.Path()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineWidth = font.getAdvanceWidth(line, node.fontSize, {
      letterSpacing: node.letterSpacing / node.fontSize,
    })
    let x = 0
    if (node.align === 'center') x = (node.width - lineWidth) / 2
    else if (node.align === 'right') x = node.width - lineWidth
    const y = node.fontSize + i * lineHeight
    const linePath = font.getPath(line, x, y, node.fontSize, {
      letterSpacing: node.letterSpacing / node.fontSize,
    })
    for (const cmd of linePath.commands) combinedPath.commands.push(cmd)
  }

  const data = combinedPath.toPathData(3)
  const bbox = combinedPath.getBoundingBox()
  return {
    id: newId(),
    type: 'path',
    name: `${node.name} (outlines)`,
    locked: false,
    hidden: false,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    opacity: node.opacity,
    data,
    fill: node.fill,
    stroke: null,
    strokeWidth: 0,
    width: bbox.x2 - bbox.x1,
    height: bbox.y2 - bbox.y1,
  }
}

