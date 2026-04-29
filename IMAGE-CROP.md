# Image Crop

A manual region-and-angle crop tool for image nodes — drag a rotatable rect on top of an image and the image renders clipped to that region. CorelDraw's PowerClip / Figma's image-crop UX, no ML, no bundle bloat. Non-destructive: the original raster is preserved on the node, so re-entering crop mode lets you readjust the region or restore the full image.

This is **scoped tight**. v1 is rectangular-with-rotation only; lasso / polygon / freehand are out of scope. The point is to land a useful primitive cleanly, not to ship a full bitmap-editing surface.

---

## What's in scope

- **Per-image rotatable rect crop.** An image node gains an optional `crop: { x, y, w, h, rotation }` field expressed in image-local coords. The image renders clipped to that rotated rect via Konva's `clipFunc`. Original raster (the `src` and intrinsic `width`/`height`) is unchanged.
- **Crop edit mode.** A new tool mode (`toolMode = 'crop-image'`) entered via right-click → "Crop image" on a selected image, or by double-clicking the image. The crop rect renders with standard transformer handles (resize + rotate). Drag the rect to move; resize handles change `w`/`h`; the rotation handle changes `rotation`. Apply commits; Escape reverts.
- **Visual cue for what's being cropped out.** The pixels outside the crop rect dim while in crop mode so users can see the cropped material at a glance.
- **Bbox follows the crop.** Selection outlines, transformer, alignment, and SVG/PNG export all read the crop's axis-aligned bbox (not the original image's bbox) when `crop` is set. The image "is" what the crop shows.
- **Reset to full image.** A "Reset crop" item in the right-click menu and a small button in crop mode strip the crop field and restore the original bounds.

## What's not in scope

- **Non-rect crops.** No lasso, no polygon, no freehand, no path-as-clip. v2 conversation if there's pull.
- **Multi-image crop in one stroke.** v1 enters crop mode for one selected image at a time. Crop multiple images by repeating.
- **Per-pixel alpha brushing or eraser.** Not the same mental model — those need destructive raster ops on a backing canvas.
- **ML background removal.** Separate problem, separate doc if we ever ship it.
- **Crop on non-image nodes.** Vector shapes already have boolean ops (and the knife) for this. Crop is image-only.
- **Cropping into the image (panning the source under a fixed crop window).** Figma supports this via a separate "edit content" sub-mode. v1 just edits the crop rect itself; reposition the whole image by dragging it before entering crop mode.
- **Aspect-ratio locks during resize.** Standard transformer behavior (Shift to constrain) is enough; no presets like 1:1 / 16:9.

---

## Phases

### 1. Schema + render

The `ImageNode` (or whatever the codebase calls it — `asset` of media kind `'image'` based on the existing tree) gains a nullable `crop` field, plumbed through every place an image's bbox or rendered geometry is computed.

- `crop: { x: number; y: number; width: number; height: number; rotation: number } | null` on the image node type. `null` means "no crop, render the full image."
- Render: wrap the existing `<Image>` Konva element in a `<Group>` whose `clipFunc` traces the rotated rect in image-local coords. The Group inherits the image node's outer transform (`x`, `y`, `rotation`); the clip applies in image-local frame.
- `getNodeBbox`: when `crop` is set, return the AABB of the rotated crop rect (rotated around the rect's center, in image-local coords, then offset by the image's own `x`/`y` and outer rotation). When unset, fall back to the existing full-image bbox.
- Export: SVG and PNG export both consult `getNodeBbox`, so a crop'd image exports as the cropped region. SVG specifically needs a `<clipPath>` element referencing the rotated rect — straightforward `transform="rotate(...)"` on the rect inside the clip.

### 2. Crop edit mode

A new tool mode mirrors how `edit-path` works today: entered for a specific node, owns a draft `crop`, exited via Apply / Cancel.

- `toolMode = 'crop-image'` plus `cropEditState: { nodeId: string; draft: Crop } | null`.
- Entry points: right-click an image → "Crop image", or double-click an image. Both call `enterImageCrop(nodeId)`.
- Initial draft = the node's current `crop`, or a full-image rect (`{ x: 0, y: 0, w: imgWidth, h: imgHeight, rotation: 0 }`) if there's no existing crop.
- Apply: writes `draft` to the node and exits the mode. Triggered by Enter, clicking outside the image, or a small "Apply" button on the floating crop panel.
- Cancel: discards `draft`, exits. Triggered by Escape or a "Cancel" button.
- While in mode, all other selection / hit-testing on the canvas is suppressed — only the crop rect's handles respond.

### 3. Crop rect handles + dim overlay

The crop rect renders on top of the image with standard handles. Outside the rect, the image is dimmed to communicate what's being cropped.

- Reuse the existing `CanvasTransformer` for the resize + rotation handles, attached to the draft crop rect. The rect itself is a Konva `Rect` with rotation; transformer mutates its `x`/`y`/`width`/`height`/`rotation`, which maps 1:1 to the draft.
- Drag the rect's body to translate; drag handles to resize; drag the rotation handle to rotate. Shift while resizing constrains aspect; Shift while rotating snaps to 15° steps. (Both already work on the existing transformer — no new code needed.)
- Dim overlay: render a full-image-sized darkened rect *behind* the crop rect, then re-render the cropped portion of the image *inside* the crop rect at full opacity. Konva `clipFunc` on a Group containing the bright copy.
- Clamping: the crop rect can extend beyond the image bounds (useful when rotated near a corner) but Apply still records the rect as-is — pixels outside the source raster simply render transparent on commit.

### 4. Reset, persistence, and export wiring

Last bits to make crop feel finished.

- Right-click on a cropped image gains a "Reset crop" item that nulls the `crop` field. Same item disabled when there's no crop.
- The `.builty` file format already serializes nodes wholesale, so adding `crop` to the schema is automatic. Bump `SCHEMA_VERSION` so files saved with crop don't open silently-broken in older builds.
- SVG export emits a `<clipPath id="...">` per crop'd image, referenced by `clip-path="url(#...)"` on the `<image>` element. PNG export already reads bbox-derived geometry, so it works once `getNodeBbox` honors the crop.

---

## Data model

```ts
type ImageCrop = {
  x: number          // top-left in image-local coords
  y: number
  width: number      // size of the crop rect
  height: number
  rotation: number   // degrees, around the rect's center
}

// On the existing image/asset node:
type ImageNodeAdditions = {
  crop: ImageCrop | null
}

// Tool-mode extension:
type ToolMode = 'select' | 'pen' | 'edit-path' | 'knife' | 'crop-image'

// Edit-state slice on the store:
type CropEditState = {
  nodeId: string
  draft: ImageCrop
} | null
```

`crop` lives on the node, not the store. The store only holds the *in-progress* draft via `cropEditState`. Apply moves the draft onto the node; cancel drops it.

---

## Order

1, 2, 3, 4 — but 1 ships invisibly first (schema + render with null crop is a no-op against the current UI), then 2 + 3 + 4 layer on the editing surface. Rationale:

- Phase 1 lets us land the schema change, the bbox change, and the render path without any UI risk. Verifies that files round-trip cleanly and existing images render exactly as before.
- Phase 2 is the smallest possible "crop works": you can enter crop mode, the existing crop renders as the draft, Apply writes it back. No editing UX yet — you can verify the data flow.
- Phase 3 adds the actual editing: handles, drag, dim overlay. Most user-visible work.
- Phase 4 is housekeeping: reset, schema bump, export. Easy once everything else is wired.
