# Boolean Operations — Implementation Plan

Non-destructive, live-evaluated boolean groups (Figma-style). Source shapes stay editable; the boolean result re-computes whenever a child changes. Flatten-to-path is an explicit command, not the default.

Four ops: `unite`, `subtract`, `intersect`, `exclude`. Shortcut targets: `Cmd+Alt+U/S/I/X`.

---

## Data model changes

New node type:

```ts
type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude'

type BooleanNode = NodeBase & {
  type: 'boolean'
  op: BooleanOp
  // cached result, recomputed on child change
  cache: {
    data: string          // SVG path d-string, origin at (0,0)
    width: number
    height: number
    version: number       // bumps when any descendant mutates
  } | null
}
```

Children attach via the existing `parentId` field (same mechanism as groups). `NodeType` union gains `'boolean'`.

Style (`fill`, `stroke`, `strokeWidth`, `opacity`, `blendMode`) lives on the `BooleanNode` itself, not inherited per-render. On creation, seed it from the bottom-most child.

---

## Phases

Each phase is shippable on its own — partial booleans are still useful. Stop after Phase 4 if the polish phases feel like overkill.

---

### Phase 1 — Node → world-space path pipeline

**Goal:** One async function that turns any `CanvasNode` into a paper path in world coordinates, ready to boolean against another.

- New `nodeToWorldPath(node, ctx): Promise<paper.PathItem | null>` in `src/composition/node-to-path.ts`
- Per-type conversion:
  - `rect` → `paper.Path.Rectangle` (rounded variant when `cornerRadius > 0`)
  - `ellipse` → `paper.Path.Ellipse`
  - `path` → `parsePath(n.data)`
  - `icon` → `fetchIconSvg` → parse children paths → unite internally into one `CompoundPath`
  - `text` → `textToOutlines` → `parsePath(outlined.data)`
  - `group` → recurse on children, unite results, apply group's transform on top
  - `boolean` (nested) → recurse — evaluate inner boolean first, treat its result as a path
  - `line` → return `null` (open path; reject the op upstream)
- Bake node transform: `path.rotate(n.rotation, [0,0])` then `path.translate(n.x, n.y)`
- `ctx` param carries async resources (icon cache, opentype fonts) so callers don't re-fetch

**Done when:** A two-shape fixture (rotated rect + translated ellipse) produces a correctly-placed unioned `pathData` string via a unit-testable function.

---

### Phase 2 — Store shape + create/destroy actions

**Goal:** `BooleanNode` lives in the store. Create, change op, and flatten actions work, with undo.

- Extend `CanvasNode` union with `BooleanNode`
- Store actions (in `src/state/canvas-store.ts`):
  - `createBoolean(ids: string[], op: BooleanOp)` — reparents the nodes via `parentId`, inserts a new `BooleanNode` at the bottom-most child's z-index, inherits style from that child, `cache: null`, `select([newId])`
  - `changeBooleanOp(id, op)` — updates op, invalidates cache
  - `flattenBoolean(id)` — evaluates once, replaces the boolean + its descendants with a single `PathNode`, fires as one store update so undo restores the whole subtree
  - `ungroupBoolean(id)` — removes the boolean wrapper but keeps children at their current world positions (mirrors `ungroup`)
- Extend `removeNodes` to cascade through booleans (same as groups — already handled if parentId logic is generic)
- Extend `duplicateNodes` to deep-copy a boolean's subtree with new IDs

**Done when:** Selecting two shapes + calling `createBoolean` produces a `BooleanNode` in the store with the sources reparented; `flattenBoolean` collapses it to a `PathNode`; both are a single undo step.

---

### Phase 3 — Live evaluation + cache invalidation

**Goal:** The boolean's `cache.data` stays in sync with its children automatically.

- `evaluateBoolean(id, store): Promise<void>` — resolves all descendant paths via Phase 1, reduces with the op (order = child z-order ascending, matters for `subtract`), writes `cache = { data, width, height, version }`
- Cache invalidation hook inside `updateNode`: after applying the update, walk `parentId` chain; for each boolean ancestor, set `cache: null` (or bump a `dirty` flag) and queue re-evaluation
- Re-evaluation runs on an rAF tick, coalesced — dragging a child fires one eval per frame max, with a final eval on `onDragEnd`
- Subtract order: children are evaluated in z-order; `result = first.subtract(rest reduced by unite)`. Rearranging children in the layers panel directly affects output

**Done when:** Moving, resizing, or recoloring a child updates the rendered boolean within one frame; dragging stays smooth (no per-mousemove re-eval).

---

### Phase 4 — Canvas rendering + selection

**Goal:** Booleans render on canvas as a single shape; children are hidden from the canvas but present in the tree.

- `NodeRenderer` branch for `'boolean'`: render a `Konva.Path` using `node.cache.data`, positioned at `(node.x, node.y)` with `node.rotation`. If cache is `null`, render nothing and kick off an evaluation
- In `stage.tsx` `renderTree`: for `'boolean'` nodes, **do not render children** — they live in the store but not on the canvas (except when in "enter mode", phase 5)
- `handleSelectNode` already walks to `outermostAncestor` — no change; clicking on the rendered boolean selects the `BooleanNode`
- Transformer: treat booleans the same as `PathNode` — resize enabled, scale-bakes into `cache.data` via `scalePath`. Rotation is applied to the boolean, not children
- Marquee selection and snap targets use the boolean's bbox (from `cache`), not individual children

**Done when:** A boolean behaves as a single shape on the canvas — click, drag, resize, rotate, snap — while its source shapes remain live in the store and re-evaluate when edited programmatically.

---

### Phase 5 — Enter mode (edit children in place)

**Goal:** Double-click a boolean → its children become selectable and editable; ESC exits.

- New `editingBooleanId` state in the canvas store (or component-local — probably store so keyboard handlers can read it)
- When `editingBooleanId === node.id`:
  - The boolean's cached result renders at reduced opacity (~40%) as a visual reference
  - Children ARE rendered on canvas, fully interactive
  - Clicking outside the boolean's bbox exits; ESC exits; clicking another boolean switches
- Transformer rules: inside enter mode, selection is children, not the boolean
- Re-evaluation still runs on each child edit so the reference ghost updates live

**Done when:** You can double-click into a boolean, nudge one of its source shapes, and see the result update live underneath; ESC returns you to treating the boolean as a single selectable unit.

---

### Phase 6 — Layers panel + op controls

**Goal:** Booleans are discoverable and switchable without keyboard.

- Layers panel row for a boolean: op badge (`U` / `S` / `I` / `X`), expand caret, children nested beneath
- Right-click menu: *Change op →* (submenu), *Flatten to path*, *Ungroup boolean*, plus the existing lock/hide/rename/delete
- Drag-reorder within a boolean's children changes evaluation order — document this in a tooltip on the op badge (matters only for `subtract`)
- Properties panel, when a `BooleanNode` is selected: op switcher segmented control, fill/stroke controls (editing the boolean's own style), Flatten button
- `Cmd+G` on a selected boolean wraps it in a regular group (booleans and groups compose freely; no special-case)

**Done when:** A non-keyboard user can create, switch, and flatten booleans entirely through the panel UI.

---

### Phase 7 — Export, persistence, polish

**Goal:** Booleans survive serialization, export cleanly, and handle edge cases gracefully.

- SVG serializer (`src/export/svg-serializer.ts`): boolean branch emits a single `<path d="{cache.data}" …>` with the boolean's own transform/fill/stroke. If `cache` is null at export time, force-evaluate synchronously before serializing
- Project JSON persistence: store `op` + children refs; drop `cache` (ephemeral — regenerate on load). On load, queue an eval for every boolean
- Empty result handling: if `result.isEmpty()` or bbox is zero, render a dashed outline of the union of child bboxes and flag the boolean in the panel ("empty result")
- Single-child degenerate case: if all but one child is deleted, keep the boolean wrapper and label it "empty op" in the panel — no auto-flatten (user may be about to add another child)
- Keyboard shortcuts: `Cmd+Alt+U/S/I/X` create; `Cmd+Shift+E` flatten selected boolean(s)
- rAF-coalesced re-eval (from phase 3) extended: skip re-eval during pure translation of all children as a unit (i.e., dragging the boolean itself — the cached path just translates)
- Layer thumbnails render booleans via the cached path (treat as `PathNode` in `layer-thumbnail.tsx`)

**Done when:** Export, reload, and edge-case inputs (disjoint intersect, single-child boolean) don't crash and produce reasonable output.

---

## Out of scope (v1)

- **Stroke-as-fill before op.** Boolean ops run on the fill shape only; strokes on source children are ignored in the result. Documented limitation. Revisit if a real logo needs it.
- **Boolean groups exported as SVG `<clipPath>` / `<mask>`.** Everything flattens to a `<path>` on export — most consumers (icon sets, print, CSS) want flat paths.
- **Editing children while the boolean is selected at the top level.** You must explicitly enter the boolean. Figma does the same.
