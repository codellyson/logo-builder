# Pen Tool & Path Editing

Upgrade from "canvas editor" to "real vector tool." Two connected features:

- **Pen tool** — draw arbitrary paths by placing anchor points (corner and smooth).
- **Path editing** — select an existing `PathNode` and edit its anchors and curve handles.

These compose naturally: pen creates, edit mode refines. Everything flows through `paper.Path` at runtime and serializes back to SVG `pathData` for the store.

---

## Data model changes

`PathNode` already exists and stores `data: string` (SVG `d`). No schema change for the node itself — the round-trip is via paper.js:

- **Load for edit:** `new paper.Path({ pathData: node.data })` → exposes `.segments` (anchor + handleIn + handleOut each).
- **Commit edit:** `path.pathData` → write back to `node.data`.

Two new pieces of UI / app state:

```ts
type ToolMode = 'select' | 'pen' | 'edit-path'
// stored on the canvas store, outside partialize (not undoable)

type PenDraftState = {
  segments: PenDraftSegment[]   // accumulating as user clicks
  closed: boolean
} | null

type PathEditState = {
  nodeId: string
  selectedSegmentIndices: number[]
} | null
```

Both live on the store alongside `editingBooleanId` (transient UI state, not undoable).

Keyboard: **`P`** for pen, **`V`** for select (return), **`A`** for edit-path on the selected `PathNode` (A for "anchor"; E is already flatten).

---

## Phases

Each phase is independently shippable. Phases 1–3 give you a working pen. Phases 4–7 layer on editing. Phase 8 is polish.

---

### Phase 1 — Pen tool: corner-point placement

**Goal:** Enter pen mode, click to drop corner anchors, close the path.

- Add `toolMode` to canvas store; `setToolMode(mode)` action (not undoable)
- Enter pen mode via toolbar button or `P` key; cursor feedback indicates pen mode
- In pen mode, canvas clicks append `{ x, y }` to the `PenDraftState.segments` (no handles → corner points)
- Render the draft as a live preview layer:
  - Drawn segments as straight lines
  - "Rubber band" from last placed anchor to cursor (mousemove)
  - Small dot at each placed anchor
- Close conditions:
  - Click the first anchor again → closed path
  - Press `Enter` → open path committed as drawn
  - Press `Escape` → discard draft, return to select mode
- On commit, convert draft to `pathData` (`M x0 y0 L x1 y1 ... Z`), create a new `PathNode` with default fill/stroke, add to store, select it, exit pen mode

**Done when:** Enter pen mode, click four corners of a diamond, click the first anchor → closed diamond `PathNode` appears on canvas and can be dragged/scaled like any path.

---

### Phase 2 — Pen tool: Bezier curves (click-and-drag)

**Goal:** Classic pen-tool behavior — click creates corner, click-and-drag pulls out handles to create a smooth curve.

- Extend `PenDraftSegment` to carry optional `handleIn` / `handleOut` deltas
- Mousedown at `p` → start a new anchor at `p`. If mouse moves before mouseup → accumulate handle length + direction (mirrored: handleOut pulls toward cursor, handleIn mirrors)
- Mouseup finalizes the anchor with its handles
- Rubber band from last anchor now respects the last anchor's `handleOut`
- On commit, the draft's segments (with handles) serialize to `pathData` with `C` (cubic Bezier) commands via paper.js: build a `paper.Path`, call `.add(new paper.Segment(point, handleIn, handleOut))` per draft segment, then read `path.pathData`
- Alt/Option held during drag → break handle symmetry (handleIn independent of handleOut, creates a "cusp"); this matches Illustrator/Figma convention

**Done when:** Click-drag-click-drag produces a smooth S-curve; opening a previous draft and adding another anchor keeps the curve continuous.

---

### Phase 3 — Pen tool: snap while placing

**Goal:** Reuse existing snap engine while placing anchors.

- While pen mode's rubber band is active, feed the candidate point through `computeSnap` against other nodes + artboard
- If the candidate snaps to an existing object edge / center / corner, render a brief snap guide line (same visual as drag snap)
- Commit uses the snapped coordinates

**Done when:** Placing a pen anchor near an existing rect's corner → snap indicator shows → anchor lands on the corner exactly.

---

### Phase 4 — Path edit mode: render + select anchors

**Goal:** Enter edit-path mode on a selected `PathNode` and see its anchors.

- `setToolMode('edit-path')` sets `pathEditState.nodeId = selected.id`
- Entry shortcuts: `A` key with a single `PathNode` selected; double-click on a `PathNode`; also a "Edit Path" button in the path properties panel
- Parse `node.data` once into `paper.Path` segments on mode entry (cache segments in component state)
- Render overlay layer inside the canvas stage:
  - Each segment's anchor point as an 8px square (filled for selected, hollow for unselected)
  - Segment connectors drawn (same as the rendered path, but with a selection-colored overlay)
- Click an anchor → select it; Shift+click → add to selection; click empty → clear selection
- Cursor feedback distinguishes "over anchor" / "over segment" / "over empty canvas"
- Exit mode: `Esc`, `V` (switch to select), or click outside the path's bbox

**Done when:** Double-click a path → anchor overlay appears; click an anchor → it highlights blue; Esc → overlay disappears, back to select mode.

---

### Phase 5 — Path edit mode: drag anchors and handles

**Goal:** Move anchors and reshape curves.

- Drag a selected anchor → update `segment.point` → rebuild `pathData` on dragEnd → `updateNode(id, { data: newPathData })`
- Smooth anchors (segments with both handleIn and handleOut) show two handle "lollipops" extending from the anchor
- Drag a handle endpoint → update `handleIn` or `handleOut`
- If the anchor is currently "smooth" (symmetric handles), moving one handle mirrors the other; if "corner" / "cusp", handles move independently
- Live redraw during drag: the overlay and the actual path update every mousemove (rAF-throttle if choppy); the canvas-store write happens on dragEnd so undo captures one step per drag
- Ancestor booleans that depend on this path invalidate via the existing `updateNode` → `invalidateBooleanAncestors` chain — no new wiring needed

**Done when:** Drag an anchor of a path that's inside a boolean → the boolean re-evaluates and updates live as you drag.

---

### Phase 6 — Path edit mode: add / remove anchors

**Goal:** Insert a new anchor on an existing segment; delete a selected anchor.

- Double-click on a path segment (not on an existing anchor) → insert a new anchor at that point. Preserve curvature via paper's `Path.divideAt(offset)` which splits a segment without changing the path shape
- Select anchor(s) and press `Backspace` / `Delete` → remove segment(s). Paper's `segment.remove()` handles reconnection
- Refuse to delete the last two segments (fewer than 2 points → no path)

**Done when:** Add a point in the middle of a straight edge → drag it out → corner now has a new vertex; select a middle anchor → Delete → edge becomes straight again.

---

### Phase 7 — Smooth / corner toggle

**Goal:** Switch an anchor's style between corner, smooth, and cusp.

- Right-click an anchor → menu: *Corner*, *Smooth*, *Cusp* (or keyboard shortcuts: `1`/`2`/`3`)
- Corner: zero out both handles
- Smooth: symmetric handles; if the anchor has existing asymmetric handles, average them into a symmetric pair
- Cusp: keep handles but unlink symmetry (Alt-drag behavior from Phase 2 produces cusps)
- Properties panel for a selected-single-anchor: small segmented control showing the current style

**Done when:** Drag a corner anchor's implicit "handle" (there isn't one) → nothing; Right-click → Smooth → two handle lollipops appear → drag one and the other mirrors.

---

### Phase 8 — Polish

**Goal:** Keyboard and UX parity with well-loved pen tools.

- Keyboard in pen mode:
  - `Backspace` during draft → remove the last placed anchor
  - `Shift` during placement → constrain rubber band to 0° / 45° / 90°
  - `Alt` during drag → break handle symmetry (from Phase 2; ensure it's also bindable mid-stroke)
- Keyboard in edit mode:
  - Arrow keys nudge selected anchors by 1px (Shift+arrow = 10px), same convention as node nudge
  - `Cmd+A` selects all anchors of the active path
- Snapping (from Phase 3) extends to edit mode for anchor drags
- Handle lollipops hidden when zoomed way out (< 0.25×) to avoid visual clutter
- If the edited `PathNode` has rotation ≠ 0, edit the anchors in the node's local frame (apply inverse rotation for display, rotate deltas on commit) — user sees handles aligned with the path's current orientation

**Done when:** A pen-tool + editing session feels like Figma/Illustrator for basic flows (draw outline, refine anchors, nudge to pixel grid).

---

## Out of scope

- **Bézier pencil / freehand** — click-and-drag-to-draw-a-curve-in-real-time. Different tool interaction model; revisit after pen works.
- **Boolean path editing on the cached result** — booleans are non-destructive; to edit the geometry, the user flattens first (already supported). Editing the cache in place would diverge from its children.
- **Path align/distribute at the anchor level** — niche; the node-level alignment from `ALIGNMENT.md` covers the common case.
- **Convert curves to polygons / simplify** — possible via paper's `.simplify()`, but a separate "clean up path" feature.
