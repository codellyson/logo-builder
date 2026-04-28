import { useCanvasStore } from '@/state/canvas-store'

// Builds a paste-ready `Template` object literal from the current canvas
// state. Used by the "Export as template" action in the header menu —
// the dialog displays this string and offers a Copy button so authors
// don't need to touch DevTools.
//
// Conventions:
//  - Any TextNode whose text === 'Brand' is rewritten to '{{brand}}', the
//    brand-name placeholder token instantiateTemplate looks for.
//  - The current palette seed becomes the template's paletteSeed.
//  - The slug is derived from the active project's name.
//  - The snapshot's `version` field is omitted from the literal — paste
//    `version: SCHEMA_VERSION` as the first field manually so registry
//    edits don't drift from the schema constant.
export function buildTemplateLiteral(): string {
  const state = useCanvasStore.getState()

  const nodes = state.nodes.map((n) => {
    if (n.type === 'text' && n.text === 'Brand') {
      return { ...n, text: '{{brand}}' }
    }
    return n
  })

  const id =
    state.activeProjectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'template'

  const tmpl = {
    id,
    name: state.activeProjectName,
    description: 'TODO: add description',
    paletteSeed: state.palette.seed,
    snapshot: {
      stageWidth: state.stageWidth,
      stageHeight: state.stageHeight,
      palette: state.palette,
      artboardBackground: state.artboardBackground,
      nodes,
    },
  }

  const literal = serializeAsTemplateLiteral(tmpl)
  return `// Paste into TEMPLATES array in src/templates/registry.ts.
// Add \`version: SCHEMA_VERSION\` as the first field of the snapshot.
${literal}`
}

// JSON.stringify with an unquoted-key transform so the result drops in
// as a JS/TS object literal rather than valid JSON. Keeps the registry
// readable.
function serializeAsTemplateLiteral(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2)
  return json.replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, '$1:')
}
