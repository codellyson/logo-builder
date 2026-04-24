# Alignment & Distribution

Multi-select productivity: align selected nodes to a common edge/center, distribute evenly, and snap to the artboard.

Bbox math already exists in [alignment.ts](src/composition/alignment.ts) (used by drag-snap); these operations use the same `getClientRect` / node-bbox primitives.

---

## Data model changes

None. These are pure actions that mutate `x` / `y` on existing nodes.

---

## Phases

### Phase 1 — Align

**Goal:** Six alignment ops on 2+ selected nodes.

- New store action `alignSelection(edge)` where `edge ∈ 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'`
- Anchor = the **bbox union** of all selected nodes. All selected move so their own bbox edge/center matches the union's.
- Respects per-node local coords; updates via `updateNode(id, { x, y })` so undo captures each move.
- Toolbar strip (next to the composition toolbar): 6 icon buttons (`lucide:align-left`, `align-center`, …). Disabled with <2 selected.

**Done when:** Four shapes scattered across the artboard → select all → Align Left → all four share the same left edge.

### Phase 2 — Distribute

**Goal:** Equal spacing between 3+ selected nodes.

- Store action `distributeSelection(axis, mode)` where `axis ∈ 'h' | 'v'` and `mode ∈ 'edges' | 'centers'`
  - `edges`: equal gaps between bbox edges (most common use)
  - `centers`: equal spacing between bbox centers
- Leaves the two outermost nodes in place; redistributes the middle ones
- Toolbar: 2 buttons (horizontal distribute, vertical distribute), default to `edges` mode. A secondary modifier or dropdown for `centers` can come later
- Disabled with <3 selected

**Done when:** Five squares at random X positions → select all → Distribute Horizontally → equal gap between each consecutive pair.

### Phase 3 — Align to artboard

**Goal:** Single-selection case — align the selected node(s) to the artboard rect itself.

- Reuse `alignSelection(edge)` internals; when selection is exactly 1 node OR when a modifier key (Shift) is held while clicking an align button, the anchor becomes the artboard bbox (0, 0, stageWidth, stageHeight) instead of the selection bbox
- UX: tooltip on the align buttons says "Align to selection (Shift: align to artboard)"

**Done when:** Single shape selected → Shift+click "Align Center H" → shape snaps to artboard horizontal center.

---

## Out of scope

- Align to a reference object ("make everything match this one") — Figma has it, niche for logos
- Align to last-selected or first-selected — same, niche
- Distribute with target spacing value — explicit px gap field, power-user
