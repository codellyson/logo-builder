# Logo Builder — Implementation Plan

A staged plan for building a logo editor that produces solid, production-grade output. Canvas-based editing, curated assets, real path composition, and a brand-pack export pipeline.

## Stack (confirmed)

**Core**
- Vite + React + TypeScript + Tailwind v4
- `konva` + `react-konva` — canvas editor
- `paper.js` — path boolean ops (monograms, enclosures, negative space)
- `opentype.js` — text-to-outlines
- `culori` — OKLCH palette math
- `zustand` + `zundo` — state + undo/redo
- `@iconify/react` — icons (curated set allowlist only)

**Fonts**
- `@fontsource/*` — bundled set (~15 display-grade Google Fonts)
- Dynamic Google Fonts loader (fetch CSS from API, cache in IndexedDB) for wider selection

**Export**
- `jszip` — brand-pack bundling
- `svgo` — SVG cleanup pass
- `to-ico` — favicon.ico multi-res

**Persistence**
- IndexedDB (via `dexie` or `idb-keyval`) — local projects

---

## Phases

Each phase is shippable on its own. Phases 0–5 get you a working tool. Stop there, use it, decide if the rest is worth building.

---

### Phase 0 — Foundation

**Goal:** Clean Vite scaffold with tooling baseline.

- Strip Vite starter boilerplate (`App.css`, starter `App.tsx`, default assets)
- Add Tailwind v4 via `@tailwindcss/vite`
- TS path aliases (`@/*` → `src/*`)
- Folder structure:
  - `src/editor/` — canvas editor UI
  - `src/canvas/` — Konva stage, shapes, interactions
  - `src/composition/` — paper.js ops, alignment engine
  - `src/export/` — SVG serializer, PNG, ZIP pipeline
  - `src/fonts/` — font registry + loaders
  - `src/icons/` — icon registry + picker
  - `src/colors/` — OKLCH utilities + palette generator
  - `src/state/` — zustand stores
  - `src/ui/` — shared UI primitives
- Prettier + ESLint baseline

**Deps:** `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`

**Done when:** `pnpm dev` renders a blank canvas shell with layout chrome.

---

### Phase 1 — Canvas + editing foundation

**Goal:** A usable Konva editor with core interactions.

- Konva stage with pan/zoom
- Shape primitives: rectangle, ellipse, line, text, image
- Selection model — single + multi, marquee select
- Transform handles (drag, resize, rotate) via `Konva.Transformer`
- Layer panel — reorder, lock, hide, rename
- Keyboard shortcuts — `delete`, arrow nudge, `cmd+d` duplicate, `cmd+z/y` undo/redo, `cmd+a` select all
- Zustand store for canvas state; `zundo` middleware for undo history
- Autosave current project to `localStorage` on every committed change

**Deps:** `konva`, `react-konva`, `zustand`, `zundo`

**Done when:** You can build a basic wordmark-and-shape logo, undo/redo reliably, refresh without losing work.

---

### Phase 2 — Typography, icons, color (the asset layer)

**Goal:** Raw materials users compose from.

- Curated font set — ~15 display-grade Google Fonts bundled via `@fontsource`
- Dynamic Google Fonts loader — fetch CSS from Google's API, cache in IndexedDB
- Font picker UI with live previews
- Iconify integration — restricted to 4 curated sets (e.g. `ph-duotone`, `solar`, `streamline`, `game-icons`)
- Icon picker with search scoped to allowlist
- OKLCH color picker built on `culori`
- Palette generator — seed color → 5-role palette (primary, accent, ink, paper, muted) with guaranteed contrast

**Deps:** `@fontsource/<fonts>`, `@iconify/react`, `culori`

**Done when:** User can drop any curated font, any curated icon, apply any palette — all from polished pickers.

---

### Phase 3 — Composition engine (the quality lever)

**Goal:** Real mark composition, not just layered shapes.

- `opentype.js` integration — "convert text to outlines" command, producing editable path on canvas
- `paper.js` wired up — boolean ops (union, subtract, intersect) on any selection of paths
- Commands:
  - "Make monogram" — takes 2 text layers, outlines both, overlaps, offers union/subtract
  - "Cut shape from shape"
  - "Merge paths"
- **Alignment / snapping engine** (custom-built):
  - Snap to optical center (cap-height mid, not bbox center)
  - Snap to baseline / cap-height / x-height alignment
  - Snap to sibling edges, centers, equal-spacing gaps
  - Smart guides visible during drag
- Safe-area / clear-space guide toggle

**Deps:** `paper.js`, `opentype.js`, `@types/opentype.js`

**Done when:** User can build a monogram, align an icon optically with a wordmark, guides feel Figma-grade.

---

### Phase 4 — Export pipeline (the deliverable)

**Goal:** Ship a real brand pack, not a PNG.

- **Custom SVG serializer** — walk the Konva tree, not `konva-to-svg`:
  - Text layers → `opentype.js` outlines
  - Shapes → native SVG equivalents
  - Paper.js-composed paths → raw `<path d>` data
  - Images → inline base64
- PNG exports at 1x, 2x, 4x via `stage.toDataURL({ pixelRatio })`
- Favicon.ico (16/32/48 multi-res) via `to-ico`
- **Auto lockup variants** from the active composition:
  - Horizontal, stacked, icon-only, wordmark-only
  - Monochrome (black, white), inverse
- `svgo` cleanup pass on all SVGs before bundling
- `jszip` brand-pack export with `README.txt` inside

**Deps:** `jszip`, `svgo`, `to-ico`

**Done when:** Exported ZIP opened on another machine with no font installed renders all SVGs identically, and the folder feels like a real deliverable.

**v1 ships here.** Use it, decide if the rest is worth building.

---

### Phase 5 — Persistence + project management

**Goal:** Multi-project workflow, local-only.

- IndexedDB-backed project store (via `dexie` or similar)
- Schema: `projects`, `project_versions`, `exports`
- Project list UI — rename, duplicate, delete
- Migrate Phase 1 `localStorage` autosave → IndexedDB autosave
- Export/import project files (`.logoproj` JSON) for backup or sharing

**Deps:** `dexie`

**Done when:** Users have a project dashboard, not just one canvas.

---

### Phase 6 — Polish + deploy

- Error boundaries + export recovery
- Performance pass — memoize Konva nodes, virtualize layer panel
- Deploy frontend to Vercel
- Analytics (PostHog or similar), error tracking (Sentry)
- Basic landing page at `/`

---

## Timeline reality check

- Phases 0–2 — ~1 week focused
- Phase 3 — ~1–2 weeks (alignment engine is the unknown)
- Phase 4 — ~1 week (custom serializer takes iteration)
- Phases 5–6 — each a few days to a week depending on scope

Ship Phases 0–4 first (~3–5 weeks focused evenings). That's the working personal tool. Everything after is additive.

---

## Non-negotiables (the quality ceiling)

Three things separate this from a Canva-clone canvas editor. Cut any of them and the output ceiling drops:

1. **`paper.js` for path boolean ops** — without it, users can move things around but can't compose real marks.
2. **Custom SVG serializer + `opentype.js` text-to-outlines** — without it, exports break on any machine missing the font.
3. **The alignment / snapping engine** — without it, compositions always look slightly off. It's custom code, not a library. Budget real time for it.

Everything else is infrastructure. These three are the product.
