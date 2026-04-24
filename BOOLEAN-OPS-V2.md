# Boolean Ops V2 — Stroke Outlining

Make strokes participate in boolean geometry. Today, if a shape has a stroke, only its fill region takes part in unions/subtracts/etc. — the stroke is discarded. V2 converts each stroked source into its outline-of-the-stroke *before* the op runs, so rings, stroked-letter marks, wireframe compositions, and stroke-based negative space all become expressible.

---

## Data model changes

Add optional cap/join fields to any node type that already carries `stroke`/`strokeWidth`:

```ts
type StrokeCap = 'butt' | 'round'
type StrokeJoin = 'miter' | 'round' | 'bevel'

// Added to RectNode, EllipseNode, LineNode, PathNode, BooleanNode
strokeCap?: StrokeCap     // default 'butt'
strokeJoin?: StrokeJoin   // default 'miter'
strokeMiterLimit?: number // default 10; only applies to join='miter'
```

Defaults match SVG/Konva defaults (`butt` / `miter`) when the field is absent. These are new schema fields — no migration, no back-compat shim.

---

## Dependency

Add `paperjs-offset` (or equivalent). Used once, in the stroke-expansion primitive. If the dep proves unacceptable (bundle size, maintenance), Phase 1 has a fallback path: hand-rolled expansion for the primitive shapes we actually ship (rect, ellipse, line, simple path).

---

## Phases

Each phase is independently shippable and leaves the app in a coherent state. Stop after Phase 3 if the polish phases feel like overkill for your workflow.

---

### Phase 1 — Stroke expansion primitive

**Goal:** One function that turns a stroked paper path into a filled outline path.

- Install `paperjs-offset`, wire it into `paper-bridge.ts`
- New `src/composition/stroke-outline.ts` with `expandStroke(path, options): paper.PathItem`
  - `options`: `{ width, cap, join, miterLimit }`
  - Returns a new filled path covering exactly the visible stroke region
- Handle both closed paths (rect, ellipse, closed path) and open paths (line, open path)
- Graceful no-op: width ≤ 0 returns `null`
- Bezier/arc geometry preserved — don't flatten to polylines (quality hit)

**Done when:** A unit-level fixture — stroked circle, stroked open polyline, stroked rounded rect — produces a visually correct outline that round-trips through `pathData` and renders identically in Konva.

---

### Phase 2 — Evaluator integration

**Goal:** Source shapes with strokes contribute both their fill and their stroke outline to the boolean.

- In `nodeToWorldPath`, when a source has `stroke` and `strokeWidth > 0`:
  - Compute fill geometry as today
  - Compute stroke outline via Phase 1
  - `unite` the two before returning (or return whichever exists — fill-only or stroke-only shapes still work)
- Apply rotation/translation to the combined path, same as now
- Groups and booleans: the recursion inside `nodeToWorldPath` already bakes transforms, so their children pick this up automatically

**Done when:** Two overlapping rects, one with a thick stroke, unioned → the stroked rect's outline is visible at the merge seam; stroked circle minus smaller circle produces a true ring of the expected thickness.

---

### Phase 3 — Lines as first-class boolean participants

**Goal:** Line nodes (currently rejected from booleans) become valid sources via their stroke outline.

- Remove the `'line'` rejection in `createBoolean` and the toolbar `canBool` check — replace with "reject only if `stroke` is null/zero AND no fill"
- `nodeToWorldPath` already returns null for unstroked lines (open path, no fill); that's fine — same rejection, just localized
- Update the Boolean Ops tooltip / panel copy: "needs 2+ shapes with visible fill or stroke"
- Confirm open `path` nodes with only stroke work the same way

**Done when:** You can draw a line, thicken it, and Subtract it from a rect to carve a stripe; the same works for an open freeform path.

---

### Phase 4 — Cap/join properties + controls

**Goal:** Users can choose cap and join styles, and those choices drive both rendering and stroke outlining.

- Extend the types listed in "Data model changes" above
- Konva renderers in `nodes.tsx`: pass `lineCap` / `lineJoin` (Konva prop names) through `commonProps`-adjacent logic for stroked shapes
- Properties panel: add `Cap` and `Join` Segmented controls to Rect, Ellipse (join only), Line, Path, and Boolean stroke sections, visible only when stroke is set
- The stroke-outline expansion in Phase 1 already consumes these via its `options` — wire node values through

**Done when:** Changing "Join" on a stroked rect from `miter` to `round` changes the visible corner on canvas, and any boolean that uses that rect updates its cached geometry to match.

---

### Phase 5 — Render / export consistency

**Goal:** Canvas, boolean evaluator, and SVG export all agree on cap/join. Loading a .svg produced here into another tool shows the same strokes.

- SVG exporter: emit `stroke-linecap="…"` and `stroke-linejoin="…"` on every stroked `<rect>` / `<ellipse>` / `<path>` / `<line>` using the node's value (default omitted — matches SVG's own defaults)
- Boolean SVG export: no change needed — the cached path already bakes cap/join into its geometry (Phase 2), so export is `<path d="…" fill="…"/>` with no separate stroke
- Layer thumbnail: serializer already path-agnostic — inherits from above

**Done when:** Export an SVG with cap/join variants, open in a second tool (Illustrator / browser / Figma paste) — strokes look identical to the canvas.

---

### Phase 6 — Edges and guardrails

**Goal:** No crashes on weird inputs; UX remains honest when stroke outlining produces nothing useful.

- Zero-width stroke: skip expansion, treat as no stroke
- Self-intersecting wide strokes on tight curves: `paperjs-offset` handles, but verify the resulting CompoundPath stays valid through the op
- Dashed strokes (if added later): outline the full solid stroke path, ignore the dash pattern — document this
- Degenerate: stroke-only source (no fill) combined with a fill-only source via Intersect when their outlines don't cross → empty result; existing empty-cache flow covers it
- Pathological: very thick stroke whose outline collapses to nothing (width ≥ 2× min dimension of the shape) — log a warning and fall back to fill-only

**Done when:** A fuzz pass (random stroke widths from 0 to 500 on random shapes) doesn't throw; no op produces a silently-incorrect result.

---

## Out of scope (v2)

- **Dashed stroke outlines** — outlining a dashed stroke into its visible dash shapes is niche; treat dashes as solid when outlining, keep them for visual stroke rendering only
- **Variable-width strokes** — not modeled yet in the shape types; revisit if requested
- **Stroke alignment (inside / center / outside)** — SVG only supports center-aligned strokes; add this if/when we support it in Konva too
