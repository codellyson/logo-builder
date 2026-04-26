# Stroke Gradients

Promote `stroke` from a hex string into the same polymorphic `Fill` type used for fills, so every stroke can be a solid color, linear gradient, or radial gradient. Direct follow-up to the gradient sprint — most of the heavy lifting (data model, render helpers, SVG export defs, panel `FillEditor`) already exists.

This is a **small, contained sprint**. Three phases, no on-canvas handles in v1 — strokes get edited via the existing panel `FillEditor` only. Two reasons: (1) showing both fill and stroke handles simultaneously gets visually crowded, and (2) the panel UI already does everything we need without new work.

---

## Data model

Today, `stroke` is `string | null` (or non-nullable `string` on `LineNode`). The migration is:

```ts
// Before
stroke: string | null

// After
stroke: Fill | null
```

`LineNode.stroke` becomes `Fill` (still non-nullable — a line with no stroke is invisible, doesn't make sense). Every other node type goes from `string | null` to `Fill | null`.

The `Fill` type is unchanged from the gradient sprint:

```ts
type Fill = SolidFill | LinearFill | RadialFill
```

Reuses existing helpers: `solidFill`, `fillSolidColor`, `convertFill`, `scaleFill`, `splitColorOpacity`, `withAlpha`. Nothing new in `fills.ts`.

Schema bumped from **v2 → v3**. v2 autosaves are rejected with a console warning (same pattern as v1 → v2 in the gradient sprint).

---

## Phases

Three phases. Each is independently shippable. Nothing here is risky enough to need its own phase the way the gradient handle overlay did — this is mostly plumbing.

---

### Phase 1 — Model migration (no UX change)

**Goal:** Replace `stroke: string | null` with `stroke: Fill | null` everywhere. Zero visible diff.

- [types.ts](src/canvas/types.ts) — every node's `stroke` field
- [factories.ts](src/canvas/factories.ts) — defaults become `solidFill('#…')`
- [nodes.tsx](src/canvas/nodes.tsx) — Konva renderers read `fillSolidColor(node.stroke)` for now (gradient branches stubbed, like phase 1 of fills)
- [properties-panel.tsx](src/editor/properties-panel.tsx) — `ColorPicker` for stroke now reads/writes via `fillSolidColor`/`solidFill`
- [svg-serializer.ts](src/export/svg-serializer.ts) — `strokeAttrs` reads `fillSolidColor(stroke)`
- [stroke-outline.ts](src/composition/stroke-outline.ts) — geometry only, no fill data, no change
- [node-to-path.ts](src/composition/node-to-path.ts) — `nodeStrokeOptions` reads stroke purely for width/cap/join, but the truthiness check (`!node.stroke`) keeps working since `null` is still falsy. Confirm and document.
- [composition-toolbar.tsx](src/editor/composition-toolbar.tsx) — `contributesGeometry` check uses `'stroke' in n && n.stroke && n.strokeWidth > 0` — still works with `Fill | null` as long as `n.stroke != null` is the truthiness test.
- [palette-panel.tsx](src/colors/palette-panel.tsx) — `applyRoleToSelection` writes a hex; needs `solidFill(hex)` wrap.
- [lockups.ts](src/export/lockups.ts) — `recolor` writes `stroke: target` (string); needs `solidFill(target)` wrap (same as fill did).
- [canvas-store.ts](src/state/canvas-store.ts) — `createBoolean` seeds stroke from a target node; type changes from `string | null` to `Fill | null`. `flattenBoolean` and `penCommit` create stroke as `string | null` literal — also need lifting.
- [autosave.ts](src/state/autosave.ts) — bump `SCHEMA_VERSION` to 3.

Existing saves break loudly. Greenfield, no migration shim.

**Acceptance:** every existing logo renders identically. Typecheck passes.

---

### Phase 2 — Render + export gradient strokes

**Goal:** Stroke gradients display on canvas and roundtrip through SVG export.

- New helper in [fills.ts](src/composition/fills.ts):
  ```ts
  // Konva render props for a stroke fill. Mirrors fillKonvaProps but emits
  // strokeLinearGradient* / strokeRadialGradient* keys.
  export function strokeKonvaProps(fill: Fill | null | undefined): Record<string, unknown>
  ```
- [nodes.tsx](src/canvas/nodes.tsx) — every renderer that currently sets `stroke={...}` and `strokeWidth={...}` now spreads `{...strokeKonvaProps(node.stroke)}`. Solid stroke routes to `stroke: hex`, gradient routes to the relevant `strokeLinearGradient*` / `strokeRadialGradient*` props.
- [svg-serializer.ts](src/export/svg-serializer.ts):
  - `strokeAttrs` becomes `strokeAttr(n, defs)` and emits a separate gradient def with id `s-${nodeId}` when stroke is a gradient. Solid strokes stay `stroke="hex"`.
  - Use `userSpaceOnUse` matching the fill pattern, so stroke gradients track node-local coords too.
- [bakeScale](src/canvas/nodes.tsx) — every fill-bearing branch already calls `scaleFill(node.fill, …)`. Add the same for `node.stroke`.
- [path-edit-overlay.tsx](src/canvas/path-edit-overlay.tsx), [pen-draft-preview.tsx](src/canvas/pen-draft-preview.tsx) — preview paths need `strokeKonvaProps` too so live editing matches the rendered shape.

**Risk: Konva stroke-gradient quirks.** `strokeLinearGradient*` / `strokeRadialGradient*` props are documented but less battle-tested than fill. Possible visual issues with rounded caps/joins or with very thin strokes. If hit, the documented fallback is rendering the stroked node via `expandStroke` (existing boolean infrastructure) and treating it as a filled outline path with the gradient applied as a fill. Budget half a day for this — if the quirk is real and the workaround is invasive, ship without rounded-cap support and document.

**Acceptance:** create a path with a linear gradient stroke, see it on canvas, export SVG, open in browser, match.

---

### Phase 3 — Panel UI

**Goal:** Stroke gradients are editable through the same `FillEditor` used by fills.

- [properties-panel.tsx](src/editor/properties-panel.tsx) — every `<ColorPicker value={node.stroke} allowNone …>` becomes `<FillEditor value={node.stroke} bbox={…} allowNone />`. Same `bbox` as the fill (computed via `getNodeLocalBbox`).
- LineNode's stroke field uses `<FillEditor allowNone={false}>` since a line without stroke is invisible.
- The fill-type tabs (Solid / Linear / Radial / None) work as-is. Stops, on-bar drag, reverse, alt-click delete — all reused.

**No on-canvas handles in v1.** Stroke gradient endpoints can only be edited via the panel (numeric stop offsets, color pickers, stop bar). If two-handle-set on the canvas becomes critical, we add a "Fill / Stroke" toggle on the existing gradient overlay later.

**Acceptance:** a designer can switch a stroke from solid → linear gradient → radial → none, edit stops, and see live updates on canvas with single-undo-per-drag (same as fill gradients).

---

## Risks

- **Konva stroke-gradient quirks** (phase 2) — documented mitigation above. Real risk; first thing to verify when phase 2 lands.
- **Save format break** — bumps to v3. Same as v2 in the gradient sprint, no migration.
- **No on-canvas stroke handles** — explicit non-goal for v1. Panel-only is acceptable because (a) most users edit stroke colors more than gradient direction on strokes specifically, and (b) the visual clutter of two handle sets fights with the existing overlay UX.
- **Eyedropper still deferred** — same as gradient sprint phase 5 stretch.

---

## Files touched (rough map)

- `src/canvas/types.ts` — stroke type widening
- `src/canvas/factories.ts` — stroke defaults via `solidFill`
- `src/canvas/nodes.tsx` — every renderer + bakeScale stroke scaling
- `src/canvas/path-edit-overlay.tsx`, `src/canvas/pen-draft-preview.tsx` — preview paths
- `src/composition/fills.ts` — `strokeKonvaProps` helper
- `src/composition/node-to-path.ts` — `nodeStrokeOptions` truthiness check
- `src/editor/properties-panel.tsx` — every stroke `ColorPicker` → `FillEditor`
- `src/editor/composition-toolbar.tsx` — `contributesGeometry` truthiness
- `src/colors/palette-panel.tsx` — role apply wraps in `solidFill`
- `src/export/lockups.ts` — recolor strokes via `solidFill`
- `src/export/svg-serializer.ts` — `strokeAttrs` → `strokeAttr` with defs collection
- `src/state/canvas-store.ts` — boolean / pen stroke seed types
- `src/state/autosave.ts` — schema v3
