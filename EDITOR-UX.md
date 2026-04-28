# Editor UX

A sprint of editor-experience improvements that compound across every session: better defaults on insert, persistent floating toolbars, right-click menus, transparent fills, and a project file format that's recognizable on disk. Individually small; together they're the difference between "feels like a prototype" and "feels like a tool."

This is **scoped tight**. We're not redesigning the editor surface or adding new authoring primitives — every item below is a paper-cut fix layered on existing flows.

---

## What's in scope

- **Transparent fill on shapes.** "None" option on every shape's Fill control. Renders as no-fill on canvas, emits `fill="none"` on SVG export, preserves alpha on PNG. Already shipped.
- **Click-to-add lands at viewport center.** Toolbar-driven inserts (rect, ellipse, text, etc.) place new nodes at the user's current viewport center, not world (0, 0). Falls back to the artboard center when the viewport isn't initialized.
- **Right-click context menu.** Cut, copy, paste, duplicate, group/ungroup, bring forward / send back, lock, hide, break-apart-subpaths, delete. Wires existing store actions and keyboard shortcuts to a positioned popover. Disabled items reflect actual capability (e.g. break-apart only enables on multi-subpath paths).
- **Repositionable floating toolbars.** Toolbar, CompositionToolbar + AlignToolbar, ZoomControls become draggable by a thin grab handle. Final positions persist in localStorage so reload doesn't reset them. A reset-to-default action lives in the keyboard shortcuts modal.
- **`.idan` project file extension.** Save / Load via File System Access API (with a `<input type="file">` fallback). Default extension is `.idan`; payload is the same JSON snapshot the autosave layer already produces, plus a manifest header so future schema bumps stay forward-compatible.

## What's not in scope

- **Toolbar customization beyond position.** No re-ordering tool buttons, no hiding/showing groups, no custom keybinds. Position-only keeps the implementation small and the UI predictable.
- **Multi-window / multi-tab project sync.** A `.idan` file is the source of truth; no live collaboration or cross-tab broadcasting.
- **Snap-to-edges or snap-to-other-toolbars** for the floating toolbars. Free positioning is fine for v1.
- **A landing page.** That's a separate project — own repo, own scaffold, own copy. Not part of this sprint.
- **Auto-arranging the toolbars on tiny viewports.** If they overlap, the user can drag.

---

## Phases

### 1. Click-to-add lands at viewport center

The store's add-shape actions (or the toolbar handlers calling them) currently produce nodes at hardcoded coords. Thread the current viewport center through and use it as the insertion point.

- Source the center from the existing zoom/pan state (`viewport.x`, `viewport.y`, `viewport.scale`). Compute the world-space center of the visible area; that's the new node's center, then back-solve `x`/`y` for top-left-anchored shapes (rect, text, asset) and use directly for centered ones (ellipse, polygon, star).
- Anchor by node bbox so a 200×80 text and a 50×50 ellipse both feel "centered on what I'm looking at."
- New nodes still respect `parentId === undefined` (top-level on the artboard).

### 2. `.idan` project file format

The autosave layer already serializes a `ProjectSnapshot` to IndexedDB. Re-use that serializer.

- **Save:** browser download of `<projectName>.idan`. MIME type `application/json` is fine.
- **Load:** drag-drop onto the editor surface (already wired for image assets — extend the dropzone to handle `.idan`) and a button in the projects modal.
- **Header:** wrap the snapshot as `{ format: 'idan', version: SCHEMA_VERSION, snapshot: {...} }` so a stray reader can sniff the file.
- File System Access API where available; `<a download>` blob URL fallback.

### 3. Right-click context menu

Position a popover at the cursor on `contextmenu` over the canvas (not the rest of the chrome — header / sidebars use the OS menu).

- Use the existing Popover primitive. Items dispatch to existing store actions / keyboard shortcuts.
- Group items by section: clipboard (cut/copy/paste/duplicate) → arrangement (group/ungroup, bring forward, send back) → state (lock, hide) → conversion (break apart, convert to path, text→outlines) → destructive (delete).
- Disabled state must match actual capability — e.g. paste is enabled only when the clipboard has nodes, break-apart only when selection has a multi-subpath path. Re-use the same predicates the toolbars already compute.

### 4. Repositionable floating toolbars

The four overlay toolbars (Toolbar, CompositionToolbar, AlignToolbar, ZoomControls) currently sit in fixed absolute positions on `<main>`. Wrap each in a `<DraggablePanel>` that owns its current `(x, y)` and persists to localStorage.

- Default positions match today's layout exactly; users only see a difference once they drag.
- Drag handle is a thin `lucide:grip` icon stuck to one edge of the panel — clicking elsewhere on the toolbar still triggers the tool action (no accidental drags).
- Localstorage key per panel: `idan.panel.<name>.pos`. Reset cleared by a "Reset toolbars" action in the help/shortcuts modal.

---

## Data model

No schema changes for #1 (click-to-add) or #3 (context menu) — both reuse existing actions.

`#2 .idan` adds a tiny envelope around the existing snapshot:

```ts
type IdanFile = {
  format: 'idan'
  version: number          // mirrors SCHEMA_VERSION at save time
  snapshot: ProjectSnapshot
}
```

`#4 toolbar positions` is localStorage-only (no store changes):

```ts
type PanelPos = { x: number; y: number }
// key: `idan.panel.${name}.pos`
// values: PanelPos
```

---

## Order

1, 2, 3, 4 — small to medium. Click-to-add is the highest impact-per-hour because every insert benefits. `.idan` and context menu can ship in either order. Repositionable toolbars last; it's the most involved and the least urgent.
