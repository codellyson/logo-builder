# Image Crop V2 — arbitrary-shape cuts

v1 shipped a rotatable rect. That's basic. CorelDraw's "cut a section" feel comes from being able to trace the region — polygon click-by-click or lasso drag-to-trace — so the cut hugs whatever shape the user has in mind. v2 adds those two modes alongside the existing rect.

This is **scoped tight**. Rect / polygon / lasso are the three modes; nothing else changes about entry, exit, dim overlay, persistence, or export structure.

---

## What's in scope

- **Mode picker inside crop edit mode.** A small inline toolbar appears while `toolMode === 'crop-image'`. Three buttons: Rect (default, current behavior), Polygon, Lasso. Switching modes resets the in-progress draft to a fresh empty state for that mode — committing one mode and re-entering crop later starts in Rect with the existing crop shown.
- **Polygon mode.** Click on the image to drop anchor points; each click extends an open polyline preview. Double-click or click the first anchor to close the polygon. Drag a placed anchor to nudge it before closing. Backspace removes the last placed anchor.
- **Lasso mode.** Press-and-drag traces a freehand path; release closes the loop. The raw stroke is simplified (Ramer–Douglas–Peucker) before commit so the resulting path is smooth and not a thousand-point monster.
- **Single shared `crop` field.** Generalize `crop` on `AssetNode` to a discriminated union: `{ kind: 'rect', ...rect } | { kind: 'path', data: string }`. Render, bbox, SVG export, schema bump all branch on `kind`. Existing rect crops stay working without migration (rect is the default).

## What's not in scope

- **Editing the polygon / lasso path after Apply.** v2 commits a finalized path; readjusting means re-entering crop mode and tracing again. Anchor-level editing of a path-clip is a v3 conversation.
- **Smooth (curved) polygon segments.** Polygon points connect with straight lines; if you want curves, use lasso (which inherently smooths).
- **Combining cuts.** No add-region / subtract-region buttons. One contiguous shape per crop.
- **Holes.** No multi-subpath clip — one outer boundary only. (CorelDraw's "intersect with" composite operations are a different feature.)
- **Persisting the editing mode.** Re-entering crop mode always starts in Rect mode, even if the existing crop was a path. Path crops show the previous shape as a static overlay; switching to Polygon / Lasso starts a fresh trace.

---

## Phases

### 5. Crop kind discriminator + mode picker

The smallest visible change first: split the `crop` field, default everyone to `rect`, render the mode picker without yet supporting Polygon / Lasso interactions.

- `ImageCrop = { kind: 'rect'; x, y, width, height, rotation } | { kind: 'path'; data: string }`. Existing rect crops in the wild are missing `kind` — treat absent as `rect` in the render / bbox / export paths.
- Mode picker: a floating panel at the bottom-center of the canvas while `toolMode === 'crop-image'`. Three buttons (Rect / Polygon / Lasso). Click switches `cropEditState.draft` to a fresh draft for that mode (rect = full-image rect, path = empty).
- For now, Polygon / Lasso buttons are present but only seed a placeholder draft — the actual interactions land in phases 6 + 7.

### 6. Polygon mode

Anchor-by-anchor tracing inside crop mode.

- Pointer-down on the image while in Polygon mode appends a point to `cropEditState.draft.points` (a number array, x, y, x, y, ...).
- Live preview: while drawing, render an open polyline for the current points plus a "rubber band" segment from the last point to the cursor. Pointer-move updates the rubber band; no commit on move.
- Closing: clicking within ε of the first anchor (or double-clicking anywhere) closes the polygon. The draft is converted to a path-data string (`M x,y L x,y ... Z`) and stored as `{ kind: 'path', data }`. Apply works as it does today.
- Backspace pops the last anchor; Escape cancels the whole crop session.

### 7. Lasso mode

Freehand drag-to-trace. Internally it's a polyline collected at high frequency, then simplified.

- Pointer-down on the image while in Lasso mode starts a stroke; record `(x, y)` on every pointer-move; pointer-up closes the stroke and commits.
- Simplify with Ramer–Douglas–Peucker (tolerance ≈ 1px in image-local coords). Reduces a 500-point sketch down to ~30 points without changing the visible shape.
- Convert to path-data the same way Polygon does (`M`, `L`, `Z`); commit as `{ kind: 'path', data }`.
- No live editing inside the stroke — release commits. Escape during a stroke cancels just that stroke; the user can start over without exiting crop mode.

### 8. Path-aware render, bbox, SVG export

Plumb the `kind: 'path'` branch through every place rect crop currently lives.

- Render: for `kind: 'path'`, the `clipFunc` walks the path data via `Path2D` (`new Path2D(data)`, `ctx.addPath(...)`). Konva's `clipFunc` accepts arbitrary canvas commands so this slots in directly.
- Bbox: parse the path with the existing paper-bridge (`pathBounds(data)`) to get the AABB in image-local coords; then fold in the image's outer (x, y, rotation) the same way the rect path does. paper.js is already lazy-loaded for the broader app, no new bundle cost in the eager bundle.
- SVG export: emit `<clipPath><path d="..."/></clipPath>` instead of `<rect>` when `kind: 'path'`. Same `userSpaceOnUse` semantics so the parent transform applies on top.

---

## Data model

```ts
export type ImageCropRect = {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type ImageCropPath = {
  kind: 'path'
  data: string  // SVG path data in image-local coords, closed loop
}

export type ImageCrop = ImageCropRect | ImageCropPath

// Edit state generalizes too:
export type CropEditState = {
  nodeId: string
  mode: 'rect' | 'polygon' | 'lasso'
  draft:
    | ImageCropRect
    | { kind: 'path'; points: number[]; closed: boolean }  // in-progress polygon/lasso
} | null
```

The in-progress draft for polygon / lasso carries `points` + `closed` so the live preview can render an open polyline before commit. Apply turns `points` into path-data; the committed `crop` always uses the final `ImageCrop` shape.

Schema: bump `SCHEMA_VERSION` 8 → 9. v8 files have rect-only crops without `kind` — load path tags them as `kind: 'rect'` on read so they round-trip cleanly.

---

## Order

5, 6, 7, 8. Rationale:

- Phase 5 plants the discriminator with no behavior change. Verifies that existing rect crops still render after the schema split.
- Phase 6 (Polygon) ships the click-by-click flow on its own — easier to verify than Lasso because each anchor is deterministic.
- Phase 7 (Lasso) layers on the drag-stroke recording + RDP simplify. Reuses the path-data commit path from Phase 6.
- Phase 8 plumbs render / bbox / SVG export through the new `kind` branch in one pass. By this point the draft → path-data conversion is settled, so it's purely about plumbing.
