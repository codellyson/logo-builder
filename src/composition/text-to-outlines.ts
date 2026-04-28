import type { Font, PathCommand } from 'opentype.js'
import type { PathNode, TextNode } from '@/canvas/types'
import { fontFileUrl } from '@/composition/font-urls'
import { newId } from '@/lib/id'

// opentype.js is ~170 kB unminified — dynamic-import it on first use so
// the initial bundle stays slim. Module identity is cached after the
// first await so subsequent calls hit the same instance. Types declare
// `export =` so we cast through the namespace import to expose the
// runtime default.
type OpentypeModule = typeof import('opentype.js')
let opentypeModulePromise: Promise<OpentypeModule> | null = null
function loadOpentype(): Promise<OpentypeModule> {
  opentypeModulePromise ??= (import('opentype.js') as unknown) as Promise<OpentypeModule>
  return opentypeModulePromise
}

// One glyph's outline, expressed in TextNode-local coords. `data` is the
// path data shifted so its top-left bbox sits at (0, 0); (x, y, width,
// height) describes that bbox in the TextNode's local frame, suitable for
// placing the glyph as its own PathNode inside a wrapping Group.
export type GlyphOutline = {
  data: string
  x: number
  y: number
  width: number
  height: number
}

const fontCache = new Map<string, Promise<Font | null>>()

async function loadFont(family: string, weight: 400 | 700): Promise<Font | null> {
  const key = `${family}::${weight}`
  const cached = fontCache.get(key)
  if (cached) return cached
  const url = fontFileUrl(family, weight)
  if (!url) return null
  const p = Promise.all([fetch(url), loadOpentype()])
    .then(async ([r, ot]) => {
      if (!r.ok) throw new Error(`font fetch failed: ${r.status}`)
      const buf = await r.arrayBuffer()
      return ot.parse(buf)
    })
    .catch((err) => {
      console.warn('Failed to load font for outlines', family, weight, err)
      return null
    })
  fontCache.set(key, p)
  return p
}

// Per-glyph outline data, one entry per visible character (whitespace and
// zero-area glyphs are skipped). Used by the Text → Outlines toolbar action
// to produce one PathNode per letter so users can edit/move glyphs
// independently. The legacy combined-path function below is still used by
// SVG export and node-to-path (boolean inputs) where a single CompoundPath
// is required.
export async function textToOutlineGlyphs(node: TextNode): Promise<GlyphOutline[] | null> {
  const weight: 400 | 700 = node.fontStyle.includes('bold') ? 700 : 400
  const [font, ot] = await Promise.all([loadFont(node.fontFamily, weight), loadOpentype()])
  if (!font) return null

  const lines = node.text.split('\n')
  const lineHeight = node.fontSize * 1.2
  const out: GlyphOutline[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineWidth = font.getAdvanceWidth(line, node.fontSize, {
      letterSpacing: node.letterSpacing / node.fontSize,
    })
    let x = 0
    if (node.align === 'center') x = (node.width - lineWidth) / 2
    else if (node.align === 'right') x = node.width - lineWidth
    const y = node.fontSize + i * lineHeight
    const paths = font.getPaths(line, x, y, node.fontSize, {
      letterSpacing: node.letterSpacing / node.fontSize,
    })
    for (const p of paths) {
      if (!p.commands.length) continue
      const bbox = p.getBoundingBox()
      const w = bbox.x2 - bbox.x1
      const h = bbox.y2 - bbox.y1
      if (w <= 0 || h <= 0) continue
      const shifted = new ot.Path()
      shifted.commands = p.commands.map((cmd) => shiftCommand(cmd, -bbox.x1, -bbox.y1))
      out.push({
        x: bbox.x1,
        y: bbox.y1,
        width: w,
        height: h,
        data: shifted.toPathData(3),
      })
    }
  }
  return out.length === 0 ? null : out
}

function shiftCommand(cmd: PathCommand, dx: number, dy: number): PathCommand {
  // PathCommand is a discriminated union; mutating coords on a clone is
  // simpler than narrowing every variant. Z has no coords and round-trips
  // unchanged.
  const next = { ...cmd } as PathCommand & {
    x?: number
    y?: number
    x1?: number
    y1?: number
    x2?: number
    y2?: number
  }
  if (next.x !== undefined) next.x += dx
  if (next.y !== undefined) next.y += dy
  if (next.x1 !== undefined) next.x1 += dx
  if (next.y1 !== undefined) next.y1 += dy
  if (next.x2 !== undefined) next.x2 += dx
  if (next.y2 !== undefined) next.y2 += dy
  return next
}

export async function textToOutlines(node: TextNode): Promise<PathNode | null> {
  const weight: 400 | 700 = node.fontStyle.includes('bold') ? 700 : 400
  const [font, ot] = await Promise.all([loadFont(node.fontFamily, weight), loadOpentype()])
  if (!font) return null

  const lines = node.text.split('\n')
  const lineHeight = node.fontSize * 1.2
  const combinedPath = new ot.Path()

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

