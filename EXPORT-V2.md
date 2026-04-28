# Export v2

The brand-pack ZIP shipped in v1 — 5 lockup variants × 3 PNG sizes + a 6-size favicon set with `.ico` — covers the "give me everything" case. v2 refines it: tag lockup roles explicitly so variants are *correct* on non-trivial logos, fix the mono pipeline's careless treatment of gradients and effects, add variant previews with selective export, and ship single-asset quick actions (Copy SVG, download one PNG) for the common "I just need this one thing" workflow.

The unlock isn't a new format — it's **trust**. Right now users click "Export ZIP" without seeing what they'll get; if the icon-only variant misses half the logo because the heuristic guesses wrong, the pack is silently broken.

---

## What's in scope

- **Manual lockup tagging.** Users designate which Group is `icon` and which is `wordmark`. Variant derivation reads the tag first, falls back to the existing heuristic for untagged projects.
- **Mono variant correctness.** Strip effects, flatten gradients to a solid mono color, preserve stroke widths and geometry. Today's mono variant just maps `fill` to a single hex without touching effects, which produces wrong-looking output (a black logo with a 50% indigo glow makes no sense).
- **Variant preview grid.** Modal shows a thumbnail of each variant before export. Users see exactly what's going into the ZIP.
- **Selective export.** Per-variant and per-size checkboxes. "I only need original SVG and a 1024 PNG" should be one click, not a dig through the ZIP.
- **Single-asset quick actions.** "Copy SVG to clipboard", "Download PNG…" with a size picker. Doesn't go through the ZIP pipeline.
- **Background control per export.** Transparent / artboard / custom hex. Currently inferred from artboardBackground heuristically.
- **Padding control.** Pad output by N% so app-icon-sized exports have safe area.

## What's not in scope

- **PDF export.** Print delivery is real but rare for the digital-first logos this tool targets. Future sprint.
- **Animated formats** (WebP video, APNG, MP4). Out of scope for a static logo tool.
- **Backend rendering / queueing.** Everything stays in-browser via `<img>` → canvas → `toBlob`. Browsers handle 4096×4096 PNG fine; we don't need a worker pool.
- **Custom font embedding in exported SVG.** Already handled — text routes through `textToOutlines` so the exported SVG has paths, not `<text>` elements depending on a font URL.
- **AI-assisted lockup detection.** Manual tagging is the v2 answer. The heuristic is a fallback for untagged work.
- **Icon-grid / safe-area visualizer on the canvas.** Just a padding number per export for v2; canvas overlays are a future polish sprint.

---

## Data model

```ts
// Add to GroupNode (and BooleanNode, since flattened booleans often act as
// the icon mark).
type GroupNode = NodeBase & {
  type: 'group'
  collapsed?: boolean
  lockupRole?: 'icon' | 'wordmark'  // ← new
}

type BooleanNode = NodeBase & {
  // ... existing fields
  lockupRole?: 'icon' | 'wordmark'  // ← new
}
```

`lockupRole` is optional — projects without any tags fall back to the current type-based heuristic. Adding two roles to `NodeBase` directly was tempting, but it's only meaningful on container-shaped nodes (Group, Boolean), so scoping the field to those keeps the type system honest.

Schema bumps from v6 → v7. Pure additive — non-breaking, auto-upgrade rewrites the version field.

---

## Phases

Six phases. Phase 1 (tagging) and phase 2 (mono fix) unblock correctness; phases 3–6 layer UX on top of an already-correct pipeline.

### Phase 1 — Lockup role tagging

**Goal:** Variants land on the right shapes for non-trivial logos.

- Add optional `lockupRole?: 'icon' | 'wordmark'` to `GroupNode` and `BooleanNode` in [canvas/types.ts](src/canvas/types.ts).
- Schema bump v6 → v7 in [persistence/db.ts](src/persistence/db.ts) and the auto-upgrade chain in [persistence/active-project.ts](src/persistence/active-project.ts).
- Properties-panel section for groups / booleans: a small two-segment toggle "Mark as: [icon] [wordmark] [—]" wired through `updateNode`.
- Update [export/lockups.ts](src/export/lockups.ts):
  - `deriveVariant(nodes, 'icon-only')` — if any node has `lockupRole === 'icon'`, return that subtree (and its descendants) plus any siblings tagged 'icon'. Otherwise fall back to the current heuristic.
  - Same for `'wordmark-only'`.
  - Document the precedence: tags > heuristic.
- Layer panel: small icon next to tagged groups (e.g. a tiny "I" or "W" badge) so the role is visible at a glance.

**Acceptance:** mark a Group as the icon, mark a TextNode group as the wordmark, export — `icon-only` SVG contains only the tagged icon subtree; `wordmark-only` contains only the tagged wordmark.

---

### Phase 2 — Mono variant correctness

**Goal:** Mono-dark and mono-light produce visually correct single-color output.

The current `recolor` in [export/lockups.ts](src/export/lockups.ts) replaces fills and strokes with a single hex but doesn't touch:
- **Gradient fills** — recolor doesn't run the gradient through; the output keeps the gradient.
- **Effects** — drop shadows, glows, and blurs survive into the mono variant. A black-on-white mono logo with a 50% blue glow is broken.
- **Stroke colors** are flattened, but stroke gradients aren't.

Fixes:
- Recolor walks fills / strokes and emits a `solidFill(targetHex)` regardless of the source's type (solid / linear / radial).
- Drop the `effects` array on every node when generating mono variants — effects are color-aware by definition.
- Outline assets (raster `<image>` elements) can't be recolored — emit them at the target color via `<image>` + `filter="brightness(0)"` overlay, or skip them with a console warn. Pick one and document.
- Stroked nodes preserve stroke width but get a solid mono stroke.

**Acceptance:** a logo with a gradient icon, a drop-shadowed wordmark, and an asset image exports as mono-dark with a single black silhouette and no shadow / glow / gradient surviving. Mono-light is the same in white.

---

### Phase 3 — Variant preview grid

**Goal:** Users see what they'll get before they click Export.

- Redesign [export/export-modal.tsx](src/export/export-modal.tsx) into a two-column layout:
  - Left: brand slug input, format/size config, Export button.
  - Right: 5-up grid of thumbnail previews (one per variant), each ~140×140.
- Each thumbnail is generated by running the existing `serializeSvg` + variant derivation, with a ~256-px PNG render for crispness.
- Skeleton loaders while previews resolve (the SVG → PNG path is async).
- Variant labels under each thumbnail: "Original", "Icon", "Wordmark", "Mono Black", "Mono White".

**Acceptance:** open Export modal — five preview thumbnails appear within ~1s on a moderate logo; users can verify the wordmark-only variant actually looks like a wordmark before committing to the export.

---

### Phase 4 — Selective export

**Goal:** "I only want the original SVG and a 1024 PNG" is one click.

- Each variant thumbnail gets a checkbox (defaults all on, mirroring v1 behavior).
- Size checkboxes: 512 / 1024 / 2048 (defaults all on).
- Format checkboxes: SVG / PNG / Favicon set (defaults all on).
- The Export button label updates: "Export 5 variants × 3 sizes (15 PNG, 5 SVG, favicon set)" → "Export original + 1024 PNG (1 SVG, 1 PNG)".
- ZIP filenames preserve the existing convention; the README inside the ZIP regenerates from selection.
- Special case: deselecting all variants disables the button.

**Acceptance:** export with only `original` + `1024 PNG` selected — ZIP contains exactly 2 files. Filename and folder layout match the variant naming.

---

### Phase 5 — Single-asset quick actions

**Goal:** Skip the ZIP for the common "I just need this one thing" case.

Three new actions, surfaced in the Export modal alongside the brand-pack flow:

- **Copy SVG.** Runs `serializeSvg` on the current visible nodes (no variant filter), runs SVGO, writes to clipboard via `navigator.clipboard.writeText`. Toast "SVG copied".
- **Download PNG.** Size picker (256 / 512 / 1024 / 2048 / custom). One file, instant download.
- **Download favicon.ico.** Single `.ico` file, no surrounding folder.

These reuse the same SVG → PNG → ICO primitives the pack already uses. The win is removing the ZIP packaging step.

**Acceptance:** "Copy SVG" produces a paste-able SVG that opens correctly in a browser tab. "Download PNG @ 512" produces one PNG, no ZIP.

---

### Phase 6 — Background + padding controls

**Goal:** App-icon and social-card sized exports come out usable without post-processing.

- **Background** dropdown: Transparent / Artboard color / Custom hex. Currently inferred from `artboardBackground !== '#ffffff'`.
- **Padding** number field: 0–25% of the artboard's shorter dimension. Padding is applied at render time by extending the SVG `viewBox` outward and centering the artboard within it (no node mutation).
- Per-export, not stored on the snapshot. Users adjust per export pass.
- Preview thumbnails reflect the current background + padding so users see the framing live.

**Acceptance:** export the same logo at 1024 PNG with 0% padding (tight) and again at 12% padding — the second has visible safe-area whitespace; both render at 1024×1024.

---

## Risks

- **Schema bump v6 → v7 is non-breaking** but adds a new optional field to two node variants. Auto-upgrade pattern is the same as v4→v5 and v5→v6 — low risk.
- **Browser SVG → canvas rasterization quirks.** `<img src=svgDataUrl>` rendered to canvas works for most things but has historical bugs around: fonts that aren't embedded (already mitigated by Text → Outlines in export), `<feGaussianBlur>` filters at very high stdDeviation (some browsers cap), and embedded base64 raster blobs (size limits). Test the brand pack against a logo that uses every effect type.
- **Padding via viewBox extension** changes the *visual* size of the artboard for that export. The actual output dimensions stay at the requested size (e.g. 1024×1024). Document so users understand padding makes the *logo* smaller within a fixed-size frame, not the frame bigger.
- **Selective export filename collisions.** If users deselect all sizes for one variant but keep sizes for another, the ZIP shouldn't have empty folders. Skip empty folders in the output.
- **Lockup tagging UX collision with grouping.** Marking a Group as "icon" and then ungrouping it loses the tag. Solution: when ungrouping a tagged group, log a console warn — or better, emit a project-level toast: "Lockup role 'icon' removed when group was dissolved." v1 of the tagging UI just lets the tag die with the group; nothing fancy.
- **Mono recolor edge cases.** Outlined raster assets can't be recolored — they're pixel data. Either skip them in mono variants (with a warn) or apply a CSS-style `filter: brightness(0)` overlay. The latter is simpler but renders inconsistently across SVG viewers. Pick: skip with warn for v1.
- **Quick-action clipboard write needs HTTPS or localhost.** `navigator.clipboard.writeText` requires a secure context. On the deployed site (Cloudflare Pages, HTTPS) this is fine; in local dev it works on `localhost`. Document so it's not a surprise.
- **Custom-font fonts that aren't outlined-on-export** would break, but the export path always outlines text via `textToOutlines`. The risk only matters if we ever ship a "preserve `<text>` elements in SVG" toggle, which is out of scope.

---

## Files touched (rough map)

- `src/canvas/types.ts` — `lockupRole?: 'icon' | 'wordmark'` on `GroupNode` and `BooleanNode`.
- `src/persistence/db.ts` — `SCHEMA_VERSION` 6 → 7.
- `src/persistence/active-project.ts` — chain v7 into the upgrade path.
- `src/export/lockups.ts` — heuristic-with-tag-precedence; mono recolor walks gradients + strips effects.
- `src/export/export-modal.tsx` — full redesign with preview grid + selection + quick actions + background/padding controls.
- `src/export/pipeline.ts` — accept selection options (variants, sizes, formats); skip empty folders.
- `src/export/raster.ts` — accept `padding` and `backgroundOverride` args.
- `src/editor/properties-panel.tsx` — `LockupRoleField` for groups / booleans; layer-panel badge.
- `src/editor/layers-panel.tsx` — small role badge next to tagged container nodes.
- `src/composition/effects-strip.ts` *(new)* — pure helper that returns a copy of a node array with all `effects` cleared (used by mono variant generation).
