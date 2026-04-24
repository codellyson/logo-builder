# Shape Library

Expand the primitive vocabulary beyond rect / ellipse / line. Focus on **parametric** shapes — the user can change "sides" or "points" after creation and the geometry updates. Non-parametric one-shot shapes belong to the pen tool, not this feature.

---

## Data model changes

Two new node types:

```ts
type PolygonNode = NodeBase & {
  type: 'polygon'
  sides: number     // ≥ 3
  radius: number    // circumscribed radius (distance from center to vertex)
  fill: string
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}

type StarNode = NodeBase & {
  type: 'star'
  points: number        // ≥ 3
  outerRadius: number
  innerRadius: number   // 0 < inner < outer
  fill: string
  stroke: string | null
  strokeWidth: number
  strokeJoin?: StrokeJoin
}
```

Both use center-anchored `x`/`y` (matches ellipse convention). Added to `NodeType` and `CanvasNode` unions.

Rationale for parametric over baked `PathNode`: logo design iterates ("make it a heptagon instead") — parametric shapes support that loop without forcing a re-draw. Users can always flatten to a path later (already possible via `convertToPath`).

---

## Phases

---

### Phase 1 — Polygon primitive

**Goal:** Create, render, edit a regular N-sided polygon.

- New `PolygonNode` type
- `createPolygon(cx, cy)` factory with defaults: `sides: 5`, `radius: 80`, `fill: '#f4f4f5'`
- `PrimitiveType` union in `factories.ts` gains `'polygon'`
- Toolbar: polygon button (pentagon icon)
- `nodes.tsx` renderer: compute vertex list from `sides` + `radius` → render `<Line points={...} closed />` (Konva's `Line` with `closed` is polygonal)
- Properties panel `PolygonFields`: `sides` NumberField (min 3, max 64), `radius`, fill, stroke, strokeWidth, strokeJoin
- `nodeToWorldPath` (boolean integration): polygon's vertex list → `paper.Path` with segments → apply transform → return
- `svg-serializer.ts`: emit `<polygon points="…">` with stroke attrs
- `bakeScale` for polygon: scale bakes into `radius` (uniform scale keeps polygon regular; non-uniform scale would distort — for now, average the scale factors and keep it regular)

**Done when:** Create a pentagon, change sides to 7 in the properties panel → polygon updates to a heptagon live. Use it in a Subtract op → cut-out shape matches. Export SVG → renders identically.

---

### Phase 2 — Star primitive

**Goal:** Same as Phase 1 but for a regular star.

- New `StarNode` type
- `createStar(cx, cy)` factory: `points: 5`, `outerRadius: 80`, `innerRadius: 40`
- Vertex computation: alternate between outer and inner radius around `2π` divided into `points * 2` slots
- Toolbar: star button
- Properties panel `StarFields`: `points` (min 3, max 32), `outerRadius`, `innerRadius`, + stroke/fill
- `nodeToWorldPath`: vertex list → `paper.Path` (closed) → transform
- `svg-serializer.ts`: emit `<polygon points="…">` (same element as polygon — just with the alternating radii baked into the points)
- `bakeScale`: non-uniform scale bakes into `outerRadius` / `innerRadius` individually

**Done when:** Create a 5-pointed star, bump points to 8, change innerRadius → shape updates. Subtract from a circle → starburst cutout.

---

### Phase 3 — Triangle preset

**Goal:** A dedicated toolbar button for triangles (polygon with `sides: 3`).

- No new node type — reuses `PolygonNode`
- `createTriangle(cx, cy)` factory with `sides: 3` (slightly adjusted radius so the visual area feels similar to rect/ellipse defaults)
- Toolbar: triangle button next to polygon
- Factored because: users look for "triangle" as a concept, not "polygon with 3 sides" — one click matters for discoverability

**Done when:** The tool toolbar has a triangle button that produces an equilateral triangle.

---

### Phase 4 — Polish

**Goal:** Odds and ends that make the shapes feel native.

- Hold Shift while resizing via transform handles: constrain polygon / star to uniform scale (regular shape stays regular)
- Rotation handle feels right: rotation is applied to the node's `rotation` (already generic), vertex computation happens in local frame — no change
- Properties panel: small "flip" buttons to rotate polygon by half a vertex (visually flip top-vertex-up to flat-top)
- Layer thumbnails render polygons/stars via their computed vertex list (same pipeline as everything else)

**Done when:** Shape vocabulary feels first-class — polygons and stars behave in booleans, groups, exports, and panels identically to rects/ellipses.

---

## Out of scope

- **Arrow / block arrow** — parametric (head/tail/width), possibly nice, but a distinct shape family. Add if requested after core library ships.
- **Rounded polygon corners** — requires per-vertex rounding; not hard but deferred.
- **Spiral** — niche for logos; skip.
- **Heart / speech bubble / other "decorative" preset paths** — feels like template content; those belong in the pen tool's output, not as preset primitives.
