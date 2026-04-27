# Effects

Add per-node visual effects — drop shadow, outer glow, blur — that render correctly on canvas, round-trip through SVG export, and stack predictably. The core unlock is **"this logo needs a soft shadow / glow / depth cue and I want it to ship as part of the SVG, not a Photoshop afterthought."**

This is **scoped tight**. The four standard logo-friendly effects are drop shadow, outer glow, inner shadow, and blur. Inner shadow is excluded from v1 because Konva has no built-in for it and the canvas-side approximation is finicky enough to be its own sprint. Animated effects, bevel/emboss, displacement, and pattern fills are explicit non-goals.

---

## What's in scope

- **Drop shadow** — offset, blur, color, opacity. Renders via Konva's built-in `shadowColor` / `shadowBlur` / `shadowOffsetX/Y` / `shadowOpacity` props (no caching needed). Exports as an SVG `<filter>` chain (`feGaussianBlur` + `feOffset` + `feFlood` + `feComposite` + `feMerge`).
- **Outer glow** — internally a drop shadow with offset (0, 0) and a tinted color. Surfaced as its own UI sub-type because users look for "glow" by name, not "shadow with no offset".
- **Blur** (Gaussian) — radius. Renders via `Konva.Filters.Blur` with `cache()`. Exports as `<feGaussianBlur stdDeviation="..." />`.
- **Effect stack** — multiple effects per node, ordered. The order matters for SVG export composition (later effects layer on top of earlier ones).
- **Group support** — effects on `GroupNode` apply to the rendered group as a unit, not to each child individually. (Konva groups support shadow props directly; SVG groups get a single `filter` URL.)
- **Live preview** — adjusting an effect re-renders the canvas in real time. Blur radius commits on slider release (caching is expensive).

## What's not in scope

- **Inner shadow.** Konva has no built-in inner shadow and approximating one with a clip-path + offset shadow is messy. Future sprint — the SVG-side filter is well-known (`feGaussianBlur` + `feOffset` + `feComposite operator="arithmetic"`) but the canvas-side preview is the sticking point.
- **Bevel / emboss.** Skeuomorphic, niche for logos.
- **Color overlays / fills as effects.** Already covered by gradient fills.
- **Per-glyph effects on text.** Effects apply to the whole TextNode in v1. If a user wants per-letter shadows, they outline first (Text → Outlines, which now produces a Group of letters) and apply effects to children.
- **Animation / interaction effects.** Static export only.
- **Filter-on-filter compositing primitives** (e.g. duotone via `feColorMatrix` chains). v1 emits a known shape of filter; arbitrary `<feColorMatrix>` editors are out.

---

## Data model

```ts
type DropShadowEffect = {
  type: 'drop-shadow'
  enabled: boolean
  offsetX: number      // px in node-local frame
  offsetY: number
  blur: number         // 0+; maps to Konva shadowBlur and SVG feGaussianBlur stdDeviation
  color: string        // hex
  opacity: number      // 0..1
}

type OuterGlowEffect = {
  type: 'outer-glow'
  enabled: boolean
  blur: number
  color: string
  opacity: number
  // No offset — the renderer derives offset (0, 0). Spread is post-v1.
}

type BlurEffect = {
  type: 'blur'
  enabled: boolean
  radius: number       // 0+; Gaussian std deviation
}

type Effect = DropShadowEffect | OuterGlowEffect | BlurEffect

type NodeBase = {
  // ... existing fields
  effects?: Effect[]   // optional, undefined / [] = no effects
}
```

`effects` lives on `NodeBase` so every node variant inherits it (rect, ellipse, path, text, icon, group, asset, boolean — even line). Effects that don't make sense on a given variant (e.g. blur on a 0-stroke line) just visually no-op rather than getting type-policed.

Order of the array matters. Convention: effects render in array order, so `effects[0]` is rendered closest to the node (innermost in the SVG filter chain), and `effects[effects.length - 1]` layers last. The UI mirrors this: the top row of the effects panel is the most-recently-added effect (visually on top), matching the layers-panel convention where row 0 = topmost.

Schema bumps from v5 → v6 because `NodeBase` gains an optional field. v5 records load cleanly into v6 code (the field is just `undefined`); the load path rewrites the version field on first save. Same auto-upgrade pattern as the assets v4 → v5 bump.

---

## Phases

Five phases. Each shippable independently. Phase 1 is plumbing; phases 2–4 are the three effect types; phase 5 is polish.

### Phase 1 — Data model + Effects panel scaffolding

**Goal:** `effects` is a first-class field, the UI surface exists, but no effect type is wired yet.

- Add `Effect` discriminated union to [canvas/types.ts](src/canvas/types.ts).
- Add `effects?: Effect[]` to `NodeBase`.
- Bump `SCHEMA_VERSION` to **6** in [persistence/db.ts](src/persistence/db.ts). Update [persistence/active-project.ts](src/persistence/active-project.ts) to accept v5 records as upgradable (rewrites `version` to 6 on load).
- New [editor/properties/effects-section.tsx](src/editor/properties/effects-section.tsx) — collapsible section, "+ Add effect" button with a popover menu (Drop Shadow / Outer Glow / Blur), per-effect rows with enable toggle / drag handle / delete. No editors yet — each row is just `{type} {enabled?}`.
- Mount the section in [editor/properties-panel.tsx](src/editor/properties-panel.tsx)'s `SingleEditor`, between `CommonFields` and the type-specific fields.
- Store actions: extend `updateNode` to accept partial effect mutations, OR add `updateEffect(nodeId, index, patch)` / `addEffect(nodeId, effect)` / `removeEffect(nodeId, index)` / `reorderEffect(nodeId, from, to)` for cleaner action surface.

**Acceptance:** select a node, "+ Add effect" → Drop Shadow → a row appears in the panel with a placeholder editor; toggling, deleting, and reordering works. No visual change on canvas yet.

---

### Phase 2 — Drop shadow

**Goal:** Adding a Drop Shadow effect renders a shadow on canvas and exports correctly to SVG.

- **Canvas:** [canvas/nodes.tsx](src/canvas/nodes.tsx) — for each node type that uses Konva shape components, derive shadow props from `effects[]`:
  - Find the *last* enabled `drop-shadow` or `outer-glow` effect (Konva is single-shadow per shape; multiple shadows in v1 means the last one wins on canvas, but SVG export does layer them all correctly — see Risks).
  - Pass `shadowColor`, `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`, `shadowOpacity`. `shadowEnabled` toggles it.
  - For `Group` nodes, the same props apply at the Group level — the entire group casts one shadow.
- **SVG export:** [export/svg-serializer.ts](src/export/svg-serializer.ts) — for each effect on a node, emit a `<filter>` element in `<defs>`, give it a stable id (`f-${node.id}-${i}` or hashed), and apply `filter="url(#…)"` to the node's outer `<g>`. The drop shadow filter chain:
  ```xml
  <filter id="…">
    <feGaussianBlur in="SourceAlpha" stdDeviation="…" />
    <feOffset dx="…" dy="…" result="offset" />
    <feFlood flood-color="…" flood-opacity="…" />
    <feComposite in2="offset" operator="in" />
    <feMerge>
      <feMergeNode />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
  ```
- **Editor:** drop shadow editor inside the effects panel — number fields for offset x/y and blur, color picker, opacity slider.
- **Layer thumbnail:** thumbnails route through `serializeSvg`, so once SVG export is in place, thumbnails should reflect shadows automatically. Verify with a node that has a long shadow extending past its bbox — the thumbnail's `viewBox` may need padding (see Risks).

**Acceptance:** add a drop shadow to a rect, see a soft shadow on canvas; export → SVG shows the shadow correctly when opened in a browser; undo/redo round-trips the effect.

---

### Phase 3 — Outer glow

**Goal:** The "Outer Glow" effect type is selectable, rendered, and exported.

Mostly a thin shell over phase 2's plumbing, since outer glow is a drop shadow with offset (0, 0) and a brand-color tint.

- Editor: blur, color, opacity. No offset fields.
- Canvas: same Konva shadow props with `offsetX/Y = 0`.
- SVG export: same filter shape with `dx="0" dy="0"`.
- A node can have both a drop shadow *and* an outer glow. Konva can only render one shadow at a time on a given shape — pick the topmost in the array (canvas previews the dominant effect; export combines them via stacked filters → see Risks).

**Acceptance:** glow + drop shadow stacked on the same node round-trip cleanly through SVG export, even if the canvas preview only shows one.

---

### Phase 4 — Blur

**Goal:** Gaussian blur effect renders on canvas and exports to SVG.

- **Canvas:** Konva blur is a `Konva.Filters.Blur` filter, which requires the node to be cached: `node.cache()` then `node.filters([Konva.Filters.Blur])` and `node.blurRadius(r)`. We need the React-Konva equivalent: pass `filters={[Konva.Filters.Blur]}` and call `cache()` via a ref effect.
- Cache invalidation: re-cache when the underlying geometry changes (fill, stroke, transform on the *contents*) but *not* on every blur-radius drag (commit on slider release).
- **SVG export:** `<feGaussianBlur stdDeviation="…" in="SourceGraphic" />`. Wrap in a `<filter>` of its own; if a node has both blur and shadow, they layer in array order in a single filter element.
- **Editor:** single radius slider (0–40 default range; clamp at 0).

**Acceptance:** a blurred rect renders blurred on canvas and exports as SVG that, when opened in a browser, blurs identically.

---

### Phase 5 — Polish

**Goal:** Effects feel finished: stacking, edge cases, performance.

- **Stacking with multiple effects:** array order = filter order in SVG. Canvas can only show one shadow / one filter chain — the renderer picks the topmost enabled shadow-like effect for shadow props, and applies blur on top via `cache()`. Document the canvas vs. export divergence in the panel UI when multiple shadows are stacked ("Canvas previews top effect; export combines all enabled").
- **Boolean inputs:** effects on a `BooleanNode`'s child are visual-only; they don't affect the boolean's geometry. Strip effects from the path before passing to the boolean evaluator (already true for fills/strokes during eval). The boolean *result* can have its own effects.
- **Pen-tool live preview:** the in-progress pen stroke shouldn't pick up the destination node's effects — it's just a guide.
- **Drag handles / selection bbox:** the selection rectangle shouldn't include the shadow halo (use the geometry bbox, not the shadow-padded bbox). Otherwise the transformer chases the shadow when it should hug the shape.
- **Layer thumbnails:** verify that effects extending past the node's bbox aren't clipped. May need to pad the SVG `viewBox` used for thumbnails by max(blur*3, |offset|) on each axis.
- **Cap the effect count** to ~8 per node — beyond that, the SVG filter chain gets pathological and the canvas preview is meaningless.

**Acceptance:** stacking multiple effects is predictable; selection / dragging / pen tool aren't affected by shadow halos; thumbnails render shadows without clipping.

---

## Risks

- **Konva is single-shadow per node.** A node with two drop shadows can only preview one of them on canvas. SVG export composes both correctly, so the printed/exported output is right but the canvas preview lies. Acceptable for v1 — surface a hint in the panel when stacking multiple shadow-like effects. Future fix would render the node multiple times into a cached layer with different shadows.
- **Blur cache invalidation.** Konva's `cache()` is expensive; calling it on every keystroke while dragging the blur slider tanks perf. Commit on slider release, not on drag.
- **Filter performance on retina canvases.** Large blur radii on already-large shapes can cause Konva to allocate huge backing canvases. Cap blur radius at ~40 in the editor; document the limit.
- **Selection bbox vs. shadow bbox.** Konva's `getClientRect()` includes shadows by default. The transformer / marquee logic must opt out (`{ skipShadow: true }`) or the selection box snaps to the shadow halo.
- **SVG filter `filterUnits`.** Default is `objectBoundingBox` for filter regions; large shadows escape the default region (-10% to 110%). Set `filterUnits="userSpaceOnUse"` and `x="-50%" y="-50%" width="200%" height="200%"` on each filter so shadows render fully.
- **Boolean ops drop effects.** When a node with a drop shadow goes into a Union, the resulting BooleanNode doesn't inherit the shadow — only geometry feeds the eval. Either: (a) accept the loss, document it, (b) propagate effects from one input to the result, (c) let users add effects to the boolean result manually. v1: option (c). The boolean's own effects field is editable.
- **Group effects + child effects.** A group with a shadow + a child with its own shadow renders both on export (the group filter wraps the already-shadowed child). On canvas, Konva applies both because the group's shadow is independent of the child's. Visually correct but layered.
- **Schema bump risk.** v5 → v6 is non-breaking (new optional field). The auto-upgrade pattern is well-trodden after assets — low risk.
- **Thumbnail viewBox clipping.** `LayerThumbnail` and `ProjectThumbnail` compute `viewBox` from local geometry bbox. Effects extend the visual bounds. Solution: pad the viewBox by the max effect reach (blur radius + |offset|).

---

## Files touched (rough map)

- `src/canvas/types.ts` — `Effect` union, `effects?` on NodeBase.
- `src/persistence/db.ts` — bump SCHEMA_VERSION to 6.
- `src/persistence/active-project.ts` — v5 → v6 upgrade in `maybeUpgradeSnapshot`.
- `src/state/canvas-store.ts` — `addEffect` / `updateEffect` / `removeEffect` / `reorderEffect` actions (or extend `updateNode`).
- `src/editor/properties/effects-section.tsx` *(new)* — panel section with add/remove/reorder.
- `src/editor/properties/effect-editors.tsx` *(new)* — per-effect-type editors (DropShadow, OuterGlow, Blur).
- `src/editor/properties-panel.tsx` — mount EffectsSection.
- `src/canvas/nodes.tsx` — derive Konva shadow props + filter array from `effects[]`; `cache()` ref effect for blur.
- `src/canvas/transformer.tsx` — opt out of shadow in `getClientRect` for selection.
- `src/export/svg-serializer.ts` — emit per-node `<filter>` chains, apply `filter="url(#…)"` to node `<g>`.
- `src/canvas/layer-thumbnail.tsx` — pad viewBox by effect reach.
- `src/composition/boolean-eval-runner.ts` — strip effects from input geometry (already implicit since eval reads pathData only, but worth confirming).
