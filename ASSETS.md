# Asset Management

Let users bring their own images, SVGs, and palettes into the editor and reuse them across projects. The core unlock is **"I have an existing logo / illustration / icon — drop it into the canvas and incorporate it into my design."** Assets live at the app level (not per-project) so they're available everywhere.

This is **scoped tight but real** — image/SVG embed, SVG-to-editable-path conversion, palette library, and custom font upload. Only deep cloud sync (multi-device, conflict resolution, auth) is deferred — that's a backend layer, not a feature.

---

## What's in scope

- **Image assets** — PNG, JPG, WebP, GIF. Stored as a Blob in IndexedDB. Rendered on canvas via Konva.Image. Exported to SVG as `<image>` with a base64 data URL.
- **SVG assets** — Stored as embedded blobs. Rendered on canvas via SVG-data-URL rasterization (same pattern as icons). Exported to SVG by inlining the SVG body. Convertible to an editable `PathNode` via a flatten-to-path action.
- **Convert SVG → editable path.** A one-click action on an SVG asset node that uses paper.js `importSVG` (already in use for icons) to flatten the entire SVG into one `CompoundPath` and replace the asset node with a `PathNode`. You lose `<rect>`/`<circle>` semantics — everything becomes path data — but the result is fully editable with the pen tool, booleans, gradients, etc.
- **Palette library** — Save the current palette by name; apply a saved palette to any project. Cross-project.
- **Custom font upload** — `.ttf` / `.otf` / `.woff2` files stored as Blob assets, registered via the `FontFace` API + `document.fonts.add`, plugged into the font picker, routed through the existing text-outlining cache.

## What's not in scope

- **Full SVG → typed nodes (rect / circle / etc.).** Beyond flatten-to-path, mapping arbitrary SVGs back to typed `RectNode` / `EllipseNode` / etc. is genuinely hard — matrix transforms don't decompose cleanly into `{x, y, rotation}`, foreign gradients use different coord conventions, clip-paths and masks have no equivalent. Flatten-to-path is the v1 answer; semantic round-trip is a future sprint.
- **Cloud sync.** Multi-device, conflict resolution, auth. That's a backend layer, not a feature — out of scope until we ship a deployment.

---

## Data model

```ts
// New IndexedDB table, parallel to `projects`.
type AssetKind = 'image' | 'svg'

type AssetRecord = {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  blob: Blob              // raw bytes; SVG kept as-is, raster as the original file
  width: number           // natural width in px (raster) or viewBox width (SVG)
  height: number          // natural height in px (raster) or viewBox height (SVG)
  createdAt: number
  updatedAt: number
}

type PaletteRecord = {
  id: string
  name: string
  palette: Palette        // existing Palette type from colors/palette.ts
  createdAt: number
  updatedAt: number
}
```

Both tables live in the existing `logo-builder` Dexie database (bumped to dexie `version(2)` to add the new stores). The existing `projects` table is untouched.

A new `AssetNode` is added to the canvas type union:

```ts
type AssetNode = NodeBase & {
  type: 'asset'
  assetId: string         // FK into the assets table
  width: number
  height: number
  // No fill / stroke — the asset's visual is its own content. Opacity and
  // blendMode (already on NodeBase) still apply.
}
```

Schema bumped from v4 → v5 because `CanvasNode` gains a new variant. v4 autosaves don't have AssetNode but they remain valid (the union now contains a strict superset of the old variants — a v4 project loads cleanly into v5 code, just won't have any asset nodes). To stay strict and consistent with prior bumps, the load path treats v4 as "compatible enough" to migrate in place: bump the snapshot's `version` to 5 on first load. This is the first time we've added a node *variant* without a structural break — worth being explicit.

---

## Phases

Seven phases. Each shippable independently. Phases 1–3 are the core asset pipeline; phase 4 is "convert to editable path" on top of that pipeline; phase 5 is the palette library; phase 6 adds custom fonts; phase 7 is polish.

### Phase 1 — Storage layer

**Goal:** Persistence is in place; the rest builds on it.

- Bump dexie schema in [persistence/db.ts](src/persistence/db.ts) to `version(2)`:
  ```ts
  this.version(2).stores({
    projects: 'id, name, updatedAt',
    assets: 'id, name, kind, updatedAt',
    palettes: 'id, name, updatedAt',
  })
  ```
- Add `AssetRecord` and `PaletteRecord` types alongside the existing project types.
- New module [persistence/assets.ts](src/persistence/assets.ts):
  - `listAssets()`, `getAsset(id)`, `createAsset(file: File): Promise<AssetRecord>`, `renameAsset(id, name)`, `deleteAsset(id)`.
  - `createAsset` reads the File via FileReader / `URL.createObjectURL`, derives natural dimensions (via `<img>` for raster, via SVG `viewBox` parsing for SVG), and stores the Blob.
- New module [persistence/palettes.ts](src/persistence/palettes.ts) — same CRUD shape, much simpler payload.
- Schema-version migration: bump `SCHEMA_VERSION` to **5**. Existing v4 project records auto-upgrade on load — `ensureActiveProject` overwrites `snapshot.version` to `5` on load and resaves. No node-shape break, so this is safe.

**Acceptance:** open browser dev tools → IndexedDB → `logo-builder` shows the new `assets` and `palettes` stores. No visible UI yet.

---

### Phase 2 — `AssetNode`: model, render, export

**Goal:** Asset nodes exist as a first-class node type and render correctly on canvas and in SVG export.

- Add `AssetNode` to [canvas/types.ts](src/canvas/types.ts) and the `CanvasNode` union.
- Add `'asset'` to `NodeType`.
- New factory `createAsset(cx, cy, asset)` in [canvas/factories.ts](src/canvas/factories.ts) — places an asset node centered at the click, sized to the asset's natural dimensions (capped to a sensible max so a 4000×4000 import doesn't dominate the artboard).
- [canvas/nodes.tsx](src/canvas/nodes.tsx) — new `AssetKonva` renderer. Loads the asset's Blob via `URL.createObjectURL` once and binds to a Konva.Image. Cleans up the URL on unmount. Cache by `assetId` to avoid re-creating URLs on every render.
- [composition/bbox.ts](src/composition/bbox.ts) — add 'asset' branch to `getNodeBbox` and `getNodeLocalBbox` (rect-shaped, top-left origin).
- [composition/node-to-path.ts](src/composition/node-to-path.ts) — for SVG assets, render the asset's path data when used inside booleans (parse the SVG via paper.js similar to icon handling); for raster assets, return a rectangle of the asset bounds (rasters can't participate in geometry but they still need to occupy space).
- [export/svg-serializer.ts](src/export/svg-serializer.ts) — `assetSvg(n, defs, assetCache)`:
  - For raster: emit `<image href="data:..." width=... height=...>` with the blob converted to a base64 data URL.
  - For SVG: inline the SVG body inside `<g transform="scale(sx sy)">` (same pattern as icon export), with the asset's viewBox as the source coord space.
- [canvas/layer-thumbnail.tsx](src/canvas/layer-thumbnail.tsx) — verify thumbnails render assets (rides through `serializeSvg`, should just work once SVG export is in place).
- bakeScale: `width: w*sx, height: h*sy`. No fill/stroke to scale.

**Acceptance:** programmatically add an `AssetNode` with a manually-uploaded asset id. It renders on canvas, exports correctly to SVG, scales/rotates with the Transformer.

---

### Phase 3 — Asset panel + import flow

**Goal:** Users can import files, browse the library, and drop assets into the canvas.

- New left-sidebar tab next to "Layers" — `AssetsPanel`. Or, alternatively, a separate panel toggle in the toolbar; final placement TBD based on screen real estate. Defaulting to a layer-panel sibling for v1.
- `AssetsPanel` shows a grid of asset thumbnails (~64×64 each) with name on hover. Click an asset → adds to the canvas at viewport center (uses existing `addNode` action with `createAsset`).
- **Import flow:**
  - "Import" button at top of panel → opens system file picker (accept `image/png, image/jpeg, image/webp, image/gif, image/svg+xml`).
  - Drag-and-drop onto the panel itself imports too.
  - Drag-and-drop directly onto the canvas creates the asset *and* drops it at the cursor position in one motion (stretch — start with file picker only, add canvas drop in phase 5).
- Each asset row has rename/delete actions on hover.
- Loading state while a file is being parsed (raster decoded for dimensions, SVG parsed for viewBox).
- File size cap (e.g. 5MB) with friendly rejection.
- Multi-file import: select multiple files at once.

**Acceptance:** a designer can drop an SVG or PNG, see it appear in the panel, click to add to canvas, edit position/size like any other node, undo, save the project, refresh, see the asset still there.

---

### Phase 4 — Convert SVG asset → editable PathNode

**Goal:** A one-click "Convert to editable" action on SVG asset nodes that produces a fully editable PathNode.

- Properties panel for `AssetNode` shows a "Convert to editable" button when `kind === 'svg'`.
- Conversion path:
  1. Load the asset Blob, parse via `paper.project.importSVG(svgString, { expandShapes: true, insert: false })` — same call we use for icons in [composition/node-to-path.ts](src/composition/node-to-path.ts).
  2. Read the imported item's bounds and `pathData` (paper.js gives us a single combined path string from the whole tree).
  3. Build a `PathNode` with the same `x` / `y` / `rotation` / `width` / `height` / `opacity` as the source AssetNode, plus a default solid fill.
  4. Replace the AssetNode with the PathNode in the same z-position via `replaceNode(oldId, newNode)` (new store action).
- The original asset record is **not deleted** — other projects or even the same project might still reference it. Conversion is a one-way action on a single node, not a destructive operation on the asset.
- Caveat surfaced in the panel: "Converting collapses all paths into one. Multi-color SVGs lose their per-element colors." Mirrors the icon-gradient hint pattern.
- New store action `replaceNode(id: string, next: CanvasNode)` — preserves z-order and parentId, clears selection, drops the old node, inserts the new at the same index.

**Acceptance:** drop an SVG, click "Convert to editable" — the SVG asset becomes a `PathNode` you can pen-edit, apply gradients to, boolean against other shapes, etc.

---

### Phase 5 — Palette library

**Goal:** Reuse palettes across projects.

- "Save palette" button in [PalettePanel](src/colors/palette-panel.tsx) — prompt for a name (or use the seed hex as default), persist via `persistence/palettes.ts`.
- "Load palette" dropdown / inline picker in the same panel — shows saved palettes, click to apply (replaces the current project's palette).
- "Manage palettes" links to a small modal (or extends the projects modal pattern) for rename/delete.
- Saved palettes don't reactively update if the source palette changes — they're immutable snapshots, like project records.

**Acceptance:** save the current palette, switch projects, load the saved palette, current project's palette is replaced.

---

### Phase 6 — Custom font upload

**Goal:** Users can bring `.ttf` / `.otf` / `.woff2` files into the font picker.

- Extend `AssetKind` with `'font'` (or use a separate `fonts` table — leaning toward the same `assets` table with `kind: 'font'` for consistency, since the storage shape is identical).
- Import flow: file picker accepting `font/*` and the `.otf`/`.ttf` extensions. On upload:
  1. Read the file as ArrayBuffer.
  2. Parse via `opentype.parse(buffer)` to extract the family name (so the picker has a sensible default).
  3. Register a `new FontFace(family, blobUrl)` and `document.fonts.add()` so Konva and the DOM can render it.
  4. Persist the Blob in IndexedDB. On app boot, re-register all custom fonts the same way before the editor mounts.
- [fonts/font-picker.tsx](src/fonts/font-picker.tsx) — extend the family list with a "Custom" section sourced from custom-font assets.
- [composition/font-urls.ts](src/composition/font-urls.ts) — `fontFileUrl(family, weight)` extension point that checks custom-font assets first (returning a `URL.createObjectURL(blob)`), falls through to the existing fontsource URLs otherwise. Text outlining (`text-to-outlines.ts`) already calls `fontFileUrl` and `opentype.parse(arrayBuffer)` — works unchanged once the URL resolution is plugged.
- Display a single weight (regular) per custom font for v1; bold/italic mapping is messy because uploaded files don't always declare their weight. The font picker hides bold/italic toggles for custom fonts and uses the file's natural weight.

**Acceptance:** drop a `.ttf`, see the family appear in the font picker, apply to a TextNode, export as SVG with text outlined to path correctly.

---

### Phase 7 — Polish + edge cases

**Goal:** The asset experience feels finished.

- **Drag-and-drop onto canvas** (the stretch from phase 3) — drop a file directly onto the artboard, the asset is created *and* placed at the drop point.
- **Asset usage count** — show "Used in N places" on each asset row (counts AssetNodes referencing the id across all projects). Helps users decide whether deleting an asset is safe.
- **Orphaned-reference handling** — if an AssetNode references a deleted asset, render a placeholder ("Missing asset") on canvas with a panel hint to relink or remove.
- **Sort options** in AssetsPanel — Recent / Name / Type.
- **Compact / grid toggle** — list view (with rename inline) vs. grid view (thumbnails only).
- **Naming auto-derivation** — default asset name is the file stem (`logo-mark.svg` → "logo-mark"). Editable inline.
- **Custom font orphan handling** — if a TextNode references a deleted custom font, fall back to the picker's default family with a panel warning.

**Acceptance:** assets feel like a first-class part of the editor, not a side feature.

---

## Risks

- **Bundle size for large embedded SVGs.** A 200KB SVG asset becomes 200KB in the SVG export AND 200KB in the IndexedDB record. Acceptable for logos, but worth noting if users import illustrations.
- **Raster asset rasterization at zoom.** Konva.Image renders at the source pixel size; zooming in shows pixelation. Out of scope to fix (raster is raster) — call this out in the import dialog if rejecting low-res files.
- **Snapshot version v4 → v5 migration.** This is the first non-break-causing schema bump. The migration just rewrites the version field on load; no data transformation needed. Worth keeping the change small to validate the pattern.
- **Race between asset delete and asset render.** A user deletes an asset while a canvas node still references it. The renderer needs to handle the missing-blob case gracefully (placeholder) rather than crashing.
- **Object URL lifecycle.** `URL.createObjectURL` leaks if not revoked. The renderer must `URL.revokeObjectURL` on unmount, and the cache (asset id → URL) must invalidate when the asset is updated.
- **SVG conversion fidelity** (phase 4). Foreign SVGs with strokes, gradients, filters, masks, or text inside don't always survive paper.js's `importSVG`. Conversion will work for the common case (filled paths) and degrade for unusual sources. Document the limitation; don't try to handle every SVG.
- **Custom font weight matching** (phase 6). Uploaded font files don't always declare their weight in metadata; matching them to the picker's regular/bold toggles is unreliable. v1 punts: one weight per uploaded family.
- **Font licensing surface** (phase 6). Users uploading paid fonts and exporting logos that embed them is a license question on their side, not ours, but worth a one-line warning in the import dialog.

---

## Files touched (rough map)

- `src/persistence/db.ts` — dexie v(2), `AssetRecord` / `PaletteRecord` types, `'font'` AssetKind
- `src/persistence/assets.ts` *(new)* — asset CRUD
- `src/persistence/palettes.ts` *(new)* — palette CRUD
- `src/persistence/active-project.ts` — bump v4 → v5 on load
- `src/canvas/types.ts` — `AssetNode`, `'asset'` in NodeType, schema doc
- `src/canvas/factories.ts` — `createAsset`
- `src/canvas/nodes.tsx` — `AssetKonva` renderer + `bakeScale` branch
- `src/composition/bbox.ts` — `'asset'` in both bbox helpers
- `src/composition/node-to-path.ts` — asset → paper.PathItem (raster = bbox rect, svg = parsed paths)
- `src/export/svg-serializer.ts` — `assetSvg`
- `src/canvas/layer-thumbnail.tsx` — verify
- `src/editor/assets-panel.tsx` *(new)* — list + import + drop
- `src/editor/editor.tsx` — mount AssetsPanel in left sidebar
- `src/colors/palette-panel.tsx` — save / load palette controls
- `src/state/canvas-store.ts` — `replaceNode` action (phase 4)
- `src/editor/properties-panel.tsx` — "Convert to editable" on AssetFields (phase 4)
- `src/fonts/font-picker.tsx` — Custom fonts section (phase 6)
- `src/composition/font-urls.ts` — extension point for custom-font URL resolution (phase 6)
- `src/fonts/preload.ts` — re-register custom fonts on boot (phase 6)
