# Project Management

Make project switching, autosave, and first-run flow rock-solid. Most of the persistence layer (IndexedDB via dexie, the projects table, CRUD helpers, the projects modal) already exists — the gaps are in the *flow*: autosave writes to a single localStorage slot instead of the active project record, the header doesn't surface the active project, and the modal mixes "create" with "switch."

This is a **flow + UX cleanup**, not a greenfield build. Three phases.

---

## Current state audit

What's already there:

- [persistence/db.ts](src/persistence/db.ts) — dexie with `projects` table (`id, name, createdAt, updatedAt, snapshot`).
- [persistence/projects.ts](src/persistence/projects.ts) — `listProjects`, `saveAsProject`, `updateProject`, `renameProject`, `deleteProject`, `duplicateProject`, `getProject`.
- [editor/projects-modal.tsx](src/editor/projects-modal.tsx) — full CRUD modal: create, save current to existing, open, rename, duplicate, delete.
- `localStorage` key `logo-builder:active-project` — tracks the active project id.
- Header has a "Projects" button that opens the modal.

What's broken or missing:

1. **Autosave still writes to a single `localStorage:autosave:v1` slot**, ignoring the active project entirely. Switching projects in the modal doesn't redirect autosave; the snapshot in IndexedDB only updates when the user clicks "Save" in the modal.
2. **No active-project indicator in the header.** Users can't see which project they're editing without opening the modal.
3. **No version field on `ProjectSnapshot`.** A project saved at schema v2 will deserialize incorrectly into v3 code with no warning.
4. **`artboardBackground` isn't in `ProjectSnapshot`** — only nodes / stage size / palette are. Autosave persists it via localStorage; switching to a project loses it.
5. **First-run UX is unclear.** A fresh user with no projects gets an empty editor and has to discover the modal to save anything.

---

## Phases

### Phase 1 — Data: snapshot schema + active project as the autosave target

**Goal:** Autosave writes to the active project's record. `ProjectSnapshot` is complete and versioned. The localStorage autosave slot is replaced.

- Extend [`ProjectSnapshot`](src/persistence/db.ts):
  ```ts
  type ProjectSnapshot = {
    version: number
    nodes: CanvasNode[]
    stageWidth: number
    stageHeight: number
    palette: Palette
    artboardBackground: string
  }
  ```
- New `SCHEMA_VERSION = 4` (bumped from autosave's v3 since the snapshot shape is now richer).
- New module [persistence/active-project.ts](src/persistence/active-project.ts):
  - `getActiveProjectId(): string | null` — reads localStorage.
  - `setActiveProjectId(id: string | null)` — writes localStorage.
  - `loadActiveProject(): Promise<ProjectRecord | null>` — combines the two with a version check; returns null if the project doesn't exist or version mismatches.
  - `ensureActiveProject(): Promise<ProjectRecord>` — load or create. On first run, migrates from the legacy `logo-builder:autosave:v1` localStorage entry if present (one-time, then clears that key).
- Rewrite [autosave.ts](src/state/autosave.ts):
  - Drop `loadSnapshot` / `saveSnapshot` (localStorage) entirely.
  - `useAutosave()` now debounces `updateProject(activeId, snapshot)` against the IndexedDB record.
  - `restoreSnapshotOnMount` becomes `restoreActiveProjectOnMount` — uses `ensureActiveProject` and seeds the store.
- Update [editor.tsx](src/editor/editor.tsx) bootstrap to await `ensureActiveProject` before rendering. Show a tiny loading state during first run if needed.
- Schema-version mismatch behavior: project record exists but `snapshot.version !== SCHEMA_VERSION`. Reject with a console warning; treat as if there's no active project; `ensureActiveProject` falls through to creating a fresh "Untitled."

**Acceptance:** open the app, edit a logo, refresh — your edits are still there. Switch projects via the modal — the *new* project's content loads, the *old* project's content was already persisted.

---

### Phase 2 — Header UX: active project visible + inline rename + menu

**Goal:** The user can always see which project they're in, rename it without opening a modal, and create/duplicate/delete from a header dropdown.

- [header.tsx](src/editor/header.tsx) — replace the "Projects" button with the active project name displayed inline. Click → small dropdown menu:
  - Rename (inline edit)
  - Duplicate
  - New project
  - All projects... (opens the existing modal)
  - Delete (with confirm)
- Rename = the project name slot becomes a `<input>` on click; commits on blur or Enter; Esc reverts.
- Surfaces the project name as both an indicator and the primary entry point. The modal remains for browsing/switching across many projects.
- New canvas-store actions:
  - `setActiveProjectName(name: string)` — local store mirror of the active record's name (no DB write here; rename action calls `renameProject` in persistence/projects.ts and refreshes the local mirror).
  - `setActiveProjectId(id: string)` — switches active project; loads snapshot, replaces store state, updates localStorage.

**Acceptance:** project name visible at all times, single-click to rename, full action menu without opening the modal.

---

### Phase 3 — Modal cleanup + first-run polish

**Goal:** The modal becomes purely a "browse and switch" surface. Polish around empty states and project thumbnails.

- Remove the "Save current canvas as new project" form from [projects-modal.tsx](src/editor/projects-modal.tsx). The header dropdown's "New project" button replaces it.
- Modal action set per project: Open, Rename, Duplicate, Delete. (Drop "Save to this project" — autosave handles persistence; manual save-to is a no-op.)
- Project thumbnails: use the existing `serializeSvg` to render a small preview (~120×120) per project record. Lazy-load on row mount; cache in a `useMemo` keyed on the snapshot's `updatedAt`.
- First-run: if `ensureActiveProject` had to create a fresh project (no migration source), seed it with no nodes — `EmptyState` already guides users.
- Sort options (most recent, alphabetical, oldest) — small, fits in modal header.

**Acceptance:** users in the modal scan thumbnails, click to switch, and never have to go back to the modal for routine work.

---

## Risks

- **Schema bump v3 → v4** — existing localStorage autosaves won't survive (they didn't survive v2 → v3 either; greenfield). The migration path in `ensureActiveProject` reads the *current* localStorage v3 entry once and seeds a "Recovered" project from it, so users don't lose work on this upgrade. Subsequent breakages don't migrate.
- **dexie version bump** — `db.ts` only declares `version(1)`; no field changes are needed since `snapshot` is opaque JSON. No db schema migration required for adding fields *inside* the snapshot.
- **Autosave race when switching projects** — debounced autosave could fire against the *previous* active id after a switch. Mitigation: when `setActiveProjectId` runs, flush the pending debounce immediately (or cancel; same effect since the new project just got loaded into the store and an autosave tick will follow).

---

## Files touched

- `src/persistence/db.ts` — `ProjectSnapshot` shape, `SCHEMA_VERSION`
- `src/persistence/projects.ts` — pass through new fields
- `src/persistence/active-project.ts` *(new)* — bootstrap + active-id helpers
- `src/state/autosave.ts` — rewrite for IndexedDB-backed autosave
- `src/state/canvas-store.ts` — `setActiveProjectId`, `setActiveProjectName` actions
- `src/editor/editor.tsx` — bootstrap waits on `ensureActiveProject`
- `src/editor/header.tsx` — active project name + dropdown menu
- `src/editor/projects-modal.tsx` — strip "Save as new", drop "Save to this project", add thumbnails + sort
