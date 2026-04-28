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

// "Xerca-style" mark: an interlocking X-shape with a hollow center,
// stacked over a wordmark + tagline. The path data is the original
// import scaled up 4x from a 68.97 × 40.864 viewBox so the mark reads
// at logo size on an 800 px artboard.
const xMark: Template = {
  id: 'x-mark',
  name: 'X Mark',
  description: 'Bold geometric X-mark over a centered wordmark',
  paletteSeed: '#0ea5e9',
  snapshot: {
    version: SCHEMA_VERSION,
    stageWidth: 800,
    stageHeight: 800,
    palette: generatePalette('#0ea5e9'),
    artboardBackground: '#ffffff',
    nodes: [
      {
        id: 'tpl-x-icon',
        type: 'path',
        name: 'Mark',
        locked: false,
        hidden: false,
        x: 262,
        y: 200,
        rotation: 0,
        opacity: 1,
        data:
          'M0.66,0c38.04,0.068,76.096,0.22,113.508,0.388c6.404,5.064,11.388,11.388,17.492,17.492c0.928,0.928,4.66,5.248,6.22,5.248c1.788,0.004,5.088-4.312,6.22-5.444c2.008-2.008,4.128-3.936,5.832-5.636c4.104-4.104,7.684-7.624,11.664-11.272c37.976,0.308,77.468-0.064,114.288,0.776c0.044,2.348-2.616,3.576-4.084,5.052c-19.12,19.524-42.42,40.696-62.196,61.228c-4.224,4.38-9.632,7.592-10.108,14.772c-0.124,1.852,0.984,4.728,1.944,6.22c2.192,3.416,5.796,6.38,8.94,9.524c9.056,9.056,18.248,19.192,27.404,27.792c10.528,10.688,21.528,21.332,32.264,32.072c1.364,1.364,3.564,2.844,3.692,5.056c-25.888,0.428-56.12,0-84.548,0c-4.6,0-9.48-0.032-14.188-0.196c-4.88-0.168-10.016,0.828-14.188,0c-2.152-0.424-4.412-3.44-6.22-5.248c-5.992-5.988-10.936-11.584-17.3-16.912c-2.408,1.28-4.32,3.384-6.22,5.248c-5.644,5.532-11.372,11.408-17.688,16.52c-38.264-0.216-76.348,0.504-113.316-0.776c0.224-2.056,2.344-3.864,3.888-5.248c20.148-19.928,42.024-41.248,62.78-62.004c3.92-3.916,10.144-9.108,7.192-16.52c-1.58-3.968-5.536-7.076-8.552-10.496c-3.124-3.544-6.764-6.408-9.332-9.72c-6.724-5.908-12.508-12.756-19.048-18.852C26.156,28.592,14.912,16.976,3.768,5.828c-1.484-1.48-4.264-3.696-3.692-5.44C0.22,0.208,0.428,0.092,0.66,0zM53.332,148.496c11.632,0,23.712,0.192,35.18,0.192c5.228,0,13.056,0.98,17.496-0.192c3.444-0.912,5.332-5.428,8.16-7c2.596-2.456,5.084-5.024,7.584-7.58c12.184-12.06,28.536-25.884,40.04-39.652c1.812-2.168,3.86-4.272,5.052-6.416c4.296-7.728-0.952-12.66-4.86-17.3c-2.544-3.016-4.532-6.076-7.384-8.356c-13.544-14.208-26.88-27.464-40.82-41.4c-1.94-1.94-4.116-4.864-6.416-5.444c-4.688-1.18-12.508-0.192-17.492-0.192c-18.864,0-35.036-0.272-53.064,0C35.548,16.668,37.724,18.212,38.752,19.24c1.252,1.252,2.736,2.476,3.692,3.5c8.288,8.476,16.892,16.336,25.268,25.268c3.864,4.12,8.38,8.224,12.44,12.828c3.96,4.492,8.344,9.176,10.304,14.968c2.412,7.14,0.5,14.524-2.916,19.436c-3.36,4.824-8.044,9.016-12.44,13.412c-11.856,11.852-23.752,24.288-35.96,35.376c-1.116,1.012-2.604,2.252-2.72,3.888C41.632,148.948,47.372,148.496,53.332,148.496z',
        fill: solidFill('#0a0a0a'),
        stroke: null,
        strokeWidth: 0,
        width: 276,
        height: 163,
      },
      {
        id: 'tpl-x-wordmark',
        type: 'text',
        name: 'Wordmark',
        locked: false,
        hidden: false,
        x: 100,
        y: 420,
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
      {
        id: 'tpl-x-tagline',
        type: 'text',
        name: 'Tagline',
        locked: false,
        hidden: false,
        x: 200,
        y: 540,
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

export const TEMPLATES: Template[] = [geometricWordmark, xMark]

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
