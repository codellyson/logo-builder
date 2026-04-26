# Gradient Fills

Promote `fill` from a hex string into a polymorphic `Fill` type so nodes can carry **linear** and **radial** gradients in addition to solid color. Logos lean on gradients constantly; the current solid-only model is the single biggest visual gap.

This is a **model migration first, feature ship second**. Every node carries `fill: string`, and that string flows through 6 layers (Konva renderers, node-to-path geometry, SVG export, lockup templates, thumbnails, live overlays). All of those need to learn the new shape before any UX is added on top.

Stroke gradients are **out of scope for v1** — Konva's stroke-gradient support is patchy, and the right path is "expand stroke to filled path then apply gradient" which is its own sprint. Strokes stay solid here.

---

## Data model

```ts
type ColorStop = { offset: number; color: string }   // offset 0..1, color = hex/rgba

type SolidFill  = { type: 'solid';  color: string }
type LinearFill = {
  type: 'linear'
  stops: ColorStop[]
  start: { x: number; y: number }   // node-local coords
  end:   { x: number; y: number }
}
type RadialFill = {
  type: 'radial'
  stops: ColorStop[]
  center: { x: number; y: number }
  radius: number
  focal?: { x: number; y: number }  // defaults to center
}
type Fill = SolidFill | LinearFill | RadialFill
```

Gradient handles live in **node-local coords** (not bbox-relative), so they can extend past the shape edge for clean ramps and so node rotation just rotates the group above them. SVG export uses `gradientUnits="userSpaceOnUse"` to match.

`fill: string | null` becomes `fill: Fill | null` (null = no fill). All node types touched: rect, ellipse, line (line stays stroke-only — ignored), text, icon, path, polygon, star, boolean.

Helper:
```ts
function solidFill(color: string): SolidFill { return { type: 'solid', color } }
```
Used everywhere the old code wrote `fill: '#xxxxxx'` so renderers stay readable.

---

## Phases

Each phase is independently shippable. Phase 1 is the migration that unblocks everything else. Phases 2–4 add the rendering and UI for each gradient type. Phases 5–6 are polish and edge-case work.

---

### Phase 1 — Fill model migration (solid-only, no UX change)

**Goal:** Replace `fill: string` with `fill: Fill` everywhere. Zero visible diff to the user.

- Add `Fill`, `SolidFill`, `LinearFill`, `RadialFill`, `ColorStop` to `src/canvas/types.ts`
- Update every node type's `fill` field; keep `null` allowance where it exists today
- Add `solidFill(hex)` helper in a new `src/composition/fills.ts`
- Update [factories.ts](src/canvas/factories.ts) — every default fill becomes `solidFill('#xxxxxx')`
- Renderers in [nodes.tsx](src/canvas/nodes.tsx) read `fill.color` for solid; the gradient branches are stubbed but unreachable
- [properties-panel.tsx](src/editor/properties-panel.tsx) `ColorPicker` continues to work — read `fill.type === 'solid' ? fill.color : firstStopColor` for display, write back as `solidFill(hex)` on change
- [svg-serializer.ts](src/export/svg-serializer.ts) reads `fill.color` for now
- [lockups.ts](src/export/lockups.ts) lockup templates updated to new shape
- [pen-draft-preview.tsx](src/canvas/pen-draft-preview.tsx) and [path-edit-overlay.tsx](src/canvas/path-edit-overlay.tsx) read `fill.color` when previewing styled fills
- Project save format **breaks** — greenfield, no migration shim. Drop old saves with a one-line warning modal on load failure
- Bump schema version constant if one exists; otherwise add one

**Acceptance:** all existing logos render identically. TypeScript passes. Saved projects from before this phase fail to load with a clear message.

---

### Phase 2 — Linear gradient: render path and basic UI

**Goal:** Linear gradients render correctly on canvas and export to SVG. Editing is via numeric inputs only — no on-canvas handles yet.

- Properties panel grows a **fill-type tab** (Solid / Linear / Radial) above the existing color picker
- Switching to "Linear" creates a default `LinearFill` from current solid color: 2 stops (current → transparent), `start = (0, 0)`, `end = (width, 0)` based on node bbox
- Stop list editor in panel: each stop shows color swatch + offset input + delete button; "Add stop" button adds one halfway between the last two
- Konva renderers (rect, ellipse, polygon, star, path, text, boolean) wire up `fillLinearGradientStartPoint`, `fillLinearGradientEndPoint`, `fillLinearGradientColorStops` when `fill.type === 'linear'`
- Color stops format for Konva: `[offset, color, offset, color, ...]` flat array — write a `toKonvaStops(stops)` helper
- `svg-serializer.ts`:
  - Gather all gradient fills into a `<defs>` block at SVG top
  - Generate IDs as `g-${nodeId}-${index}` (deterministic, stable across re-exports)
  - Emit `<linearGradient id="..." x1="..." y1="..." x2="..." y2="..." gradientUnits="userSpaceOnUse">` with `<stop offset="..." stop-color="..."/>` children
  - Node `fill` attribute becomes `url(#g-...)`
- Thumbnails — verify [layer-thumbnail.tsx](src/canvas/layer-thumbnail.tsx) renders gradients correctly (Konva should handle it natively, but check)

**Acceptance:** create a rect with a linear gradient via panel, see it on canvas, export as SVG, open the SVG in a browser, and it matches.

---

### Phase 3 — On-canvas linear gradient handles

**Goal:** Drag the gradient line directly on the canvas. This is the make-or-break UX phase.

- New overlay component `src/canvas/gradient-handle-overlay.tsx`
- Mount when: a single node is selected AND `fill.type === 'linear'` (or radial in phase 4)
- Mirrors the [path-edit-overlay.tsx](src/canvas/path-edit-overlay.tsx) pattern: local state for `start`/`end`, `draggingRef` to suppress prop sync mid-drag, commit on `dragEnd` only (so undo records one entry per drag, not 60)
- Renders:
  - Connecting line between start and end (zoom-invariant stroke width)
  - Two draggable Konva `Circle` dots for start and end
  - Optional small color swatch dot rendered at each stop's interpolated position along the line (visual aid, not draggable in this phase)
- Shift-constrains drag to 0° / 45° / 90° (reuse the constraint helper from pen tool)
- Keyboard: `Esc` while gradient overlay focused = blur back to plain selection (no other shortcuts in this phase)

**Acceptance:** drag the start handle past the shape edge — gradient updates in real-time, undo collapses the whole drag to one history entry.

---

### Phase 4 — Radial gradient: model + render + handles

**Goal:** Radial gradients reach feature parity with linear in one phase.

- "Radial" tab in properties panel produces a default `RadialFill` from current state: 2 stops (current → transparent), `center = bbox center`, `radius = max(width, height) / 2`, no focal
- Konva renderers wire `fillRadialGradient*` props
- SVG export emits `<radialGradient cx="..." cy="..." r="..." fx="..." fy="..." gradientUnits="userSpaceOnUse">`
- Gradient overlay extended for radial:
  - Draggable center dot
  - Draggable radius handle (single dot on the right of the circle, drag distance = new radius)
  - Draggable focal dot (defaults to center; **Alt-drag the center to detach focal**, mirroring the handle-symmetry pattern from the pen tool)
  - Faint preview circle at radius
- **Risk: Konva radial + node rotation**. Konva renders radial gradients in world-space, not local-space, so rotated nodes can show a misaligned gradient. If hit, the fix is to render rotated radial-gradient nodes as a `Path` with cached gradient transform applied. Budget half a day for this; if it becomes a deeper rabbit hole, document it and ship without rotation support for radials specifically.

**Acceptance:** rotate a rect with a radial gradient by 30° — the gradient rotates with the rect (visually) and SVG export matches.

---

### Phase 5 — Stop editor polish

**Goal:** Stop management is tactile and fast. This is where the UI work that didn't fit in phase 2 goes.

- Drag stops to reorder (swap offsets)
- Inline color picker per stop reusing existing `ColorPicker` component
- Numeric offset input synced bidirectionally with drag
- Visual stop-bar in the panel showing the gradient ramp with draggable stop markers (similar to Photoshop's gradient editor)
- "Reverse stops" button (flips offsets across 0.5)
- Stops along the on-canvas gradient line become **draggable** (drag = change offset; double-click = open color picker; Alt-click = delete)
- Eyedropper-from-canvas for stop color → **stretch goal**, lift to a follow-up if it bloats this phase

**Acceptance:** a designer can build a 5-stop sunset gradient in under 30 seconds without touching the keyboard.

---

### Phase 6 — Edge cases & QA pass

**Goal:** Catch the dark corners before sprint-end testing.

- **Icon node**: rewrite the cached SVG's `fill="..."` attrs to `fill="url(#g-...)"` and inject the gradient def. Multi-color icons (e.g. Phosphor duotone) collapse to a single gradient — call this out in the panel ("Gradient on icons recolors all paths"). Single-color icons work cleanly.
- **Text node**: SVG export already outlines text via [text-to-outlines.ts](src/composition/text-to-outlines.ts) — gradient just rides through on the resulting path. Konva's `Text` supports `fillLinearGradientColorStops` natively for canvas display. Verify both paths.
- **Boolean node**: gradient applies to the cached path, geometry unchanged. Trivial — confirm only.
- **Rotation**: verify gradients rotate with the node group in both Konva and SVG. (Linear is fine because handles are in local coords; radial has the Konva quirk above.)
- **Undo/redo**: every gradient handle and stop drag must commit on drag-end, not per-frame. Check the temporal store entries during a 1-second drag — should be 1 entry, not 60.
- **Project save/load**: round-trip a logo with all three fill types through save → load → re-export. Match.
- **Color picker compatibility**: `ColorPicker` writes hex. Gradient stops use the same. No alpha support yet — solid + gradient both stay 6-digit hex unless we expand the picker (out of scope here).
- **Nested groups**: gradients on grouped nodes export correctly (SVG `<g>` nesting + `userSpaceOnUse` gradients with local coords should just work, but verify).

**Acceptance:** all 9 node types render gradients on canvas, export to SVG matching the canvas, and re-import losslessly.

---

## Risks

- **Konva radial + rotation** (phase 4) — known Konva limitation; documented mitigation above. If the workaround spirals, ship without radial-rotation support and add it in a follow-up.
- **SVG `<defs>` bloat** — many gradient nodes = many defs. Acceptable; logos rarely have >20 nodes.
- **Save format break** — greenfield project, no migration. Existing saves will fail to load after phase 1. Drop a clear warning and move on.
- **Stroke gradients deferred** — explicit non-goal. Will be a follow-up sprint that builds on the existing stroke-outline-to-path infrastructure used by booleans.
- **Eyedropper deferred** — listed as stretch in phase 5, otherwise its own follow-up. Not load-bearing for v1.

---

## Files touched (rough map)

- `src/canvas/types.ts` — Fill types
- `src/composition/fills.ts` (new) — `solidFill`, `toKonvaStops`, gradient defaults
- `src/canvas/factories.ts` — every default fill
- `src/canvas/nodes.tsx` — every renderer reads `Fill`
- `src/canvas/gradient-handle-overlay.tsx` (new, phase 3)
- `src/canvas/pen-draft-preview.tsx`, `src/canvas/path-edit-overlay.tsx` — solid-only readers in phase 1
- `src/editor/properties-panel.tsx` — fill-type tabs, stop editor
- `src/editor/properties/gradient-editor.tsx` (new, phase 5) — extracted to keep the panel readable
- `src/export/svg-serializer.ts` — `<defs>` collection, `url(#)` refs
- `src/export/lockups.ts` — template fills
- `src/canvas/layer-thumbnail.tsx` — verify gradient render
- `src/composition/node-to-path.ts` — geometry only; no fill changes (booleans don't see fills)
- `src/state/canvas-store.ts` — likely no changes; gradient edits go through existing `updateNode`
