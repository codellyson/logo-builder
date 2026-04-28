# Cut Tool

Two related-but-distinct ways to "cut" something in the editor — packaged as one ship because together they close the gap with how every other vector tool behaves: a clipboard you can move selection through, and a knife that slices vector geometry along a drawn line.

This is **scoped tight**. We're shipping the clipboard first because it's mechanical, then the knife as a new tool mode. Image background removal is its own follow-up doc — different mental model (segmentation, not splitting), different tech (ML model), different UX (one-click on an image node, not a drag).

---

## What's in scope

- **Clipboard cut / copy / paste.** Internal (store-level) clipboard slot that holds a deep copy of the most recently cut/copied selection. ⌘X / ⌘C / ⌘V shortcuts plus matching items in the right-click menu. Paste lands at the current viewport center, ids regenerated, parent reset to top-level. Cut = copy + delete.
- **Knife tool.** New `toolMode = 'knife'`. Click-drag a straight line across the canvas; on release, every `PathNode` (and `path`-eligible primitive: rect, ellipse, line) the line crosses gets split into separate `PathNode`s at the crossing points. Original node is removed; the new pieces inherit fill / stroke / parent / z-position.
- **Knife as a real toolbar entry.** Slots into the existing left toolbar next to the pen tool. Keyboard shortcut `K`. Cursor changes to a knife icon while active. Escape / `V` returns to select mode.

## What's not in scope

- **OS clipboard interop.** ⌘C in our editor doesn't put anything on the OS clipboard, and pasting from outside (an SVG string, an image) isn't handled here. The clipboard is internal-only — paste only works on things we previously cut/copied in this tab.
- **Cross-tab / cross-document paste.** No `BroadcastChannel`, no `localStorage` mirror. If you reload, the clipboard is gone. Same as Figma's behavior pre-collaboration.
- **Image background removal.** Separate ship (its own doc) — uses `@imgly/background-removal` or equivalent, lazy-loaded model chunk, right-click "Remove background" on image nodes.
- **Knife on raster images.** Images don't get split by the knife — the knife is for vector geometry only. Right-click → Remove background is the image story.
- **Knife on text.** Text needs to be converted to outlines first (the existing `Text → Outlines` action). Cleaner than guessing what "splitting a 'g'" means.
- **Knife on groups / boolean nodes / nested children.** v1 cuts only top-level vector leaves (path, rect, ellipse, line). Nodes inside a group have (x, y) in group-local coords; cutting them with a world-frame knife would compute against the wrong frame. Workflow for grouped objects: ungroup, cut, regroup. Boolean nodes are skipped outright (already a composition).
- **Curved knife strokes.** v1 is a straight line — point A to point B. Freehand / poly-knife is a v2 conversation if we ever want it.

---

## Phases

### 1. Internal clipboard + keyboard shortcuts

The store gains a clipboard slot and three new actions; keyboard handler dispatches the OS shortcuts.

- Slot lives on the store as `clipboard: ClipboardPayload | null`. Replaced wholesale on each cut/copy — no stack, no history.
- Payload is a deep, normalized copy of the selection: every node gets a fresh id at paste time (we serialize with original ids and re-id on paste), and parent ids are rewritten so a pasted group keeps its internal structure but lands at top-level.
- `cutNodes(ids)` = `copyNodes(ids)` + `removeNodes(ids)`. `copyNodes(ids)` snapshots into the slot. `pasteClipboard()` re-ids the payload, offsets nodes so the bounding box centers on the current viewport center (re-uses `viewportInsertionCenter`), and selects the freshly pasted ids.
- Keyboard hookup: ⌘X / ⌘C / ⌘V in `keyboard.ts`. Skip when the focused element is an `<input>` / `<textarea>` / `[contenteditable]` so renaming a layer or editing text doesn't hijack the OS clipboard.

### 2. Cut / copy / paste in the right-click menu

The context menu already has a clipboard section called out in `EDITOR-UX.md` but never wired. Wire it.

- Three new items above the existing `Duplicate` row, in order: Cut, Copy, Paste.
- Cut / Copy enable on `hasSelection`. Paste enables when `clipboard` is non-null.
- Shortcuts shown alongside (`⌘X`, `⌘C`, `⌘V`).
- Items dispatch to the same store actions the keyboard shortcuts call — single source of truth.

### 3. Knife tool: mode + drag overlay

A new tool mode with a drag-to-draw line that previews while held.

- `toolMode` enum gains `'knife'`. Toolbar adds a `lucide:scissors` button below the pen separator. Active state mirrors how pen renders today (indigo background, indigo icon).
- Keyboard `K` toggles knife on; `V` / Escape returns to select. Same gating rules as pen (skip when typing in a field).
- While in knife mode, the canvas pointer events behave differently:
  - Pointer-down on the stage starts a knife stroke; we capture `(startX, startY)` in world coords.
  - Pointer-move updates the visible knife line — render an SVG-overlay `<Line>` from start to current cursor in the canvas-overlay layer (existing `path-edit-overlay` pattern).
  - Pointer-up commits the cut: compute geometry (phase 4), then clear the in-flight line.
- Cursor: `cursor: crosshair` while in knife mode, swap to a small knife graphic if it doesn't feel sharp enough — but `crosshair` is a fine v1.
- Esc during a stroke cancels without committing. Clicking without dragging (start ≈ end) is also a no-op.

### 4. Knife tool: path splitting math

The actual cut is a paper.js operation — same library that already powers boolean ops and break-apart-subpaths.

- Build a `paper.Path` for the knife line: two segments, no fill, no stroke.
- Walk the leaf vector nodes (path / rect / ellipse / line, recursing into groups). Skip `boolean`, `text`, `image`, `icon`, locked, hidden.
- For each node, convert to a `paper.Path` (re-use `convertToPath` for primitives) and call `path.getCrossings(knifeLine)`. Zero crossings → skip.
- For 1+ crossings, split: paper's `path.divideAt(offset)` at each crossing offset, then walk the resulting segments grouped by sub-traversal between crossings, and emit one new `PathNode` per group. Inherit fill / stroke / parent / opacity / blend mode / z-index from the original.
- Replace the original node with the new pieces in a single store transaction so undo treats it as one step.
- Edge cases: a crossing that grazes a corner (two crossings within ε of each other) collapses to one cut — guard with a small dedupe pass.

---

## Data model

Clipboard slot on the store:

```ts
type ClipboardPayload = {
  // Snapshots taken at copy time. Ids are preserved here so we can rebuild
  // parent relationships on paste; they're re-issued before insertion.
  nodes: CanvasNode[]
  // Bounding box of the snapshot, so paste can center it on the current
  // viewport without recomputing geometry.
  bbox: { x: number; y: number; width: number; height: number }
}

type CanvasStoreSlice = {
  clipboard: ClipboardPayload | null
  cutNodes: (ids: string[]) => void
  copyNodes: (ids: string[]) => void
  pasteClipboard: () => void
}
```

Tool mode extension:

```ts
type ToolMode = 'select' | 'pen' | 'knife'
```

No serialized-snapshot changes — clipboard and tool mode are session-only.

---

## Order

1, 2, 3, 4 — phases 1+2 ship together as the clipboard half; phases 3+4 ship together as the knife half. The clipboard is mostly mechanical (store actions + keyboard wiring + three menu items) so it goes first and de-risks the larger paper.js work in phase 4.

Ordering rationale:

- Phase 1 is foundational — keyboard + store. No UI surface beyond what the hotkeys imply.
- Phase 2 surfaces the actions in the existing context menu; minimal code, immediate user-visible win.
- Phase 3 introduces the knife mode and the drag-line overlay without doing any geometry — the line is purely visual at this stage. Easy to verify the mode/cursor/escape behavior in isolation.
- Phase 4 plugs the geometry split in. By this point everything else is wired, so a bug here is contained to one function.
