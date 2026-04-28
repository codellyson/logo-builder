import { SCHEMA_VERSION, type ProjectSnapshot } from '@/persistence/db'
import { generatePalette } from '@/colors/palette'
import { solidFill } from '@/composition/fills'
import type { CanvasNode } from '@/canvas/types'

// A starter logo. Templates ship as fully-designed ProjectSnapshots so a
// "New from template" pick puts the user in front of a finished-looking
// composition they can edit. The brand-name placeholder uses the literal
// `{{brand}}` token in TextNode `text` fields; instantiateTemplate
// replaces it with whatever name the user types.
export type Template = {
  id: string
  name: string
  description: string
  // The seed color the snapshot's palette was generated from. We
  // re-generate the palette at instantiation time using the user's
  // chosen seed so the rest of the editor's palette UI stays in sync.
  paletteSeed: string
  snapshot: ProjectSnapshot
}

const BRAND_TOKEN = '{{brand}}'

// Geometric Wordmark: a circle accent above a centered wordmark, plus a
// small tagline. Single placeholder template for the scaffold; the picker
// is built to scale to many.
const geometricWordmark: Template = {
  id: 'geometric-wordmark',
  name: 'Geometric Wordmark',
  description: 'Circle accent + bold wordmark + tagline',
  paletteSeed: '#6366f1',
  snapshot: {
    version: SCHEMA_VERSION,
    stageWidth: 800,
    stageHeight: 800,
    palette: generatePalette('#6366f1'),
    artboardBackground: '#ffffff',
    nodes: [
      // Circle accent (centered horizontally, upper third).
      {
        id: 'tpl-mark',
        type: 'ellipse',
        name: 'Mark',
        locked: false,
        hidden: false,
        x: 400,
        y: 280,
        rotation: 0,
        opacity: 1,
        radiusX: 64,
        radiusY: 64,
        fill: solidFill('#6366f1'),
        stroke: null,
        strokeWidth: 0,
      },
      // Wordmark.
      {
        id: 'tpl-wordmark',
        type: 'text',
        name: 'Wordmark',
        locked: false,
        hidden: false,
        x: 100,
        y: 400,
        rotation: 0,
        opacity: 1,
        text: BRAND_TOKEN,
        fontFamily: 'Inter',
        fontSize: 88,
        fontStyle: 'bold',
        fill: solidFill('#0a0a0a'),
        align: 'center',
        letterSpacing: 0,
        width: 600,
      },
      // Tagline (small, gray, optional). Left as literal text so users
      // can edit or delete after picking the template.
      {
        id: 'tpl-tagline',
        type: 'text',
        name: 'Tagline',
        locked: false,
        hidden: false,
        x: 200,
        y: 510,
        rotation: 0,
        opacity: 1,
        text: 'Tagline goes here',
        fontFamily: 'Inter',
        fontSize: 22,
        fontStyle: 'normal',
        fill: solidFill('#71717a'),
        align: 'center',
        letterSpacing: 4,
        width: 400,
      },
    ] as CanvasNode[],
  },
}

export const TEMPLATES: Template[] = [geometricWordmark]

// Returns a copy of the snapshot with `{{brand}}` swapped in TextNode
// text fields and the palette regenerated from the user's seed color.
// Doesn't touch ids — the caller is responsible for assigning fresh ids
// since templates are immutable shared records.
export function instantiateTemplate(
  template: Template,
  options: { brandName: string; paletteSeed?: string },
): ProjectSnapshot {
  const seed = options.paletteSeed ?? template.paletteSeed
  const brand = options.brandName.trim() || 'Brand'
  const nodes = template.snapshot.nodes.map((n) => {
    if (n.type === 'text' && n.text.includes(BRAND_TOKEN)) {
      return { ...n, text: n.text.replace(BRAND_TOKEN, brand) }
    }
    return n
  })
  return {
    ...template.snapshot,
    palette: generatePalette(seed),
    nodes,
  }
}
