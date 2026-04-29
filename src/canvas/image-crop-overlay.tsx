import { useEffect, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Line, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '@/state/canvas-store'
import type { AssetNode, ImageCrop } from '@/canvas/types'
import { getAsset } from '@/persistence/assets'
import { traceCropPath } from '@/composition/crop-render'

type Props = {
  scale: number
}

// Owns the visuals while an image is in crop edit mode: a dimmed full-image
// underlay (so users see what's being cropped out), a bright copy clipped
// to the draft rect (the keep), and the draft rect itself with a Konva
// Transformer attached for resize + rotate. The regular AssetKonva for the
// edited node is suppressed in NodeRenderer for the duration.
export function ImageCropOverlay({ scale }: Props) {
  const cropEditState = useCanvasStore((s) => s.cropEditState)
  const nodes = useCanvasStore((s) => s.nodes)
  const updateCropDraft = useCanvasStore((s) => s.updateCropDraft)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  // Cursor position for the polygon rubber-band preview. Image-local
  // coords. Null when the pointer hasn't entered the hit-rect yet or has
  // left it.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // Lasso captures samples while the pointer is held; ref (not state) so
  // pointer-move doesn't re-render every frame just to append.
  const lassoActiveRef = useRef(false)

  const node =
    cropEditState && (nodes.find((n) => n.id === cropEditState.nodeId) as AssetNode | undefined)
  const draft = cropEditState?.draft ?? null

  // Load the source raster — same pattern as AssetKonva. Reset when the
  // edited node changes (rare; entering a different image's crop mode).
  useEffect(() => {
    if (!node) return
    let cancelled = false
    let url: string | null = null
    setImage(null)
    void getAsset(node.assetId).then((rec) => {
      if (cancelled || !rec) return
      url = URL.createObjectURL(rec.blob)
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImage(img)
      }
      img.src = url
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [node?.assetId])

  // Attach the Transformer to the draft rect once both refs are mounted.
  // Re-attach on mode change too: switching to polygon / lasso unmounts the
  // Rect; switching back mounts a fresh one whose ref the Transformer
  // would otherwise miss.
  useEffect(() => {
    if (!cropEditState || cropEditState.mode !== 'rect') return
    const tr = trRef.current
    const rect = rectRef.current
    if (!tr || !rect) return
    tr.nodes([rect])
    tr.getLayer()?.batchDraw()
  }, [cropEditState?.nodeId, cropEditState?.mode])

  if (!node || !draft) return null

  // Snapshot the draft as a committable ImageCrop *just* for the bright-
  // preview clip. Path drafts that aren't yet closed contribute no preview
  // (clipping to nothing renders blank — better to show only the dim
  // layer until the user closes the loop).
  const previewCrop: ImageCrop | null =
    draft.kind === 'rect'
      ? draft
      : draft.closed && draft.points.length >= 6
        ? { kind: 'path', data: pointsToPathData(draft.points) }
        : null

  const onRectChange = (e: Konva.KonvaEventObject<Event>) => {
    const t = e.target
    const sx = t.scaleX()
    const sy = t.scaleY()
    // Bake scale into width/height so subsequent gestures start from a
    // 1.0 scale baseline — matches how the rest of the canvas commits.
    const w = Math.max(0.5, t.width() * sx)
    const h = Math.max(0.5, t.height() * sy)
    t.scaleX(1)
    t.scaleY(1)
    t.width(w)
    t.height(h)
    updateCropDraft({
      x: t.x(),
      y: t.y(),
      width: w,
      height: h,
      rotation: t.rotation(),
    })
  }

  return (
    <Group x={node.x} y={node.y} rotation={node.rotation}>
      {/* Dim layer: full source image at low opacity so users see the
          material that will be cropped out. */}
      <KonvaImage
        image={image ?? undefined}
        width={node.width}
        height={node.height}
        opacity={0.35}
        listening={false}
      />
      {/* Bright preview: clipped to the committable form of the draft.
          Same routine as the live render path so the preview matches what
          Apply will produce. */}
      {previewCrop && (
        <Group clipFunc={(ctx) => traceCropPath(ctx, previewCrop)}>
          <KonvaImage
            image={image ?? undefined}
            width={node.width}
            height={node.height}
            listening={false}
          />
        </Group>
      )}
      {/* Polygon mode: a hit-rect over the image area captures clicks
          (append point) and pointer-moves (rubber band). Closing happens
          when the user clicks within ε of the first anchor (≥3 points)
          or double-clicks anywhere. */}
      {cropEditState?.mode === 'polygon' && draft.kind === 'path' && (
        <>
          <Rect
            x={0}
            y={0}
            width={node.width}
            height={node.height}
            // Hairline-alpha fill so hit-testing fires on every pixel of
            // the image area, including the dimmed margins.
            fill="rgba(0,0,0,0.001)"
            listening={!draft.closed}
            onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
              if (draft.closed) return
              e.cancelBubble = true
              const group = e.target.getParent()
              const pos = group?.getRelativePointerPosition()
              if (!pos) return
              // Single source of close: clicking the larger first-anchor
              // dot. The hit-rect just appends, so casual clicks near the
              // first anchor never accidentally finalize the polygon.
              updateCropDraft({ points: [...draft.points, pos.x, pos.y] })
            }}
            onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) => {
              if (draft.closed) return
              const group = e.target.getParent()
              const pos = group?.getRelativePointerPosition()
              if (pos) setCursor(pos)
            }}
            onMouseLeave={() => setCursor(null)}
          />
          <PolygonDraftPreview
            points={draft.points}
            closed={draft.closed}
            cursor={!draft.closed ? cursor : null}
            scale={scale}
            draggableAnchors
            onAnchorDrag={(index, x, y) => {
              const cur = useCanvasStore.getState().cropEditState?.draft
              if (!cur || cur.kind !== 'path') return
              const next = cur.points.slice()
              next[index * 2] = x
              next[index * 2 + 1] = y
              updateCropDraft({ points: next })
            }}
            onCloseLoop={() => updateCropDraft({ closed: true })}
            onSegmentInsert={(insertIndex, x, y) => {
              const cur = useCanvasStore.getState().cropEditState?.draft
              if (!cur || cur.kind !== 'path') return
              const next = cur.points.slice()
              next.splice(insertIndex * 2, 0, x, y)
              updateCropDraft({ points: next })
            }}
            onAnchorDelete={(index) => {
              const cur = useCanvasStore.getState().cropEditState?.draft
              if (!cur || cur.kind !== 'path') return
              const next = cur.points.slice()
              next.splice(index * 2, 2)
              // If we drop below the close-able threshold, force the
              // polygon back to open so the next click extends it again.
              updateCropDraft({
                points: next,
                closed: next.length >= 6 ? cur.closed : false,
              })
            }}
          />
        </>
      )}
      {/* Lasso mode: pointer-down starts a stroke, pointer-move appends
          samples, pointer-up closes + simplifies. The window-level mouseup
          catches releases that happen outside the image hit-rect. */}
      {cropEditState?.mode === 'lasso' && draft.kind === 'path' && (
        <>
          <Rect
            x={0}
            y={0}
            width={node.width}
            height={node.height}
            fill="rgba(0,0,0,0.001)"
            listening={!draft.closed}
            onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
              if (draft.closed) return
              e.cancelBubble = true
              const group = e.target.getParent()
              const pos = group?.getRelativePointerPosition()
              if (!pos) return
              lassoActiveRef.current = true
              updateCropDraft({ points: [pos.x, pos.y], closed: false })
            }}
            onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) => {
              if (!lassoActiveRef.current) return
              const group = e.target.getParent()
              const pos = group?.getRelativePointerPosition()
              if (!pos) return
              const cur = useCanvasStore.getState().cropEditState?.draft
              if (!cur || cur.kind !== 'path') return
              const last = cur.points
              // Skip points within ε to avoid sample storms when the
              // pointer barely moves; RDP at commit-time will tidy the
              // rest.
              const dx = pos.x - last[last.length - 2]
              const dy = pos.y - last[last.length - 1]
              if (dx * dx + dy * dy < 1) return
              updateCropDraft({ points: [...last, pos.x, pos.y] })
            }}
          />
          <PolygonDraftPreview
            points={draft.points}
            closed={draft.closed}
            cursor={null}
            scale={scale}
          />
          <LassoUpCapture
            active={lassoActiveRef}
            onCommit={() => {
              const cur = useCanvasStore.getState().cropEditState?.draft
              if (!cur || cur.kind !== 'path') return
              const simplified = rdpSimplify(cur.points, 1)
              updateCropDraft({ points: simplified, closed: simplified.length >= 6 })
            }}
          />
        </>
      )}
      {/* Rect mode: draggable + transformable rect with indigo outline.
          Polygon / lasso modes render their own previews in phases 6+7. */}
      {draft.kind === 'rect' && (
        <Rect
          ref={rectRef}
          x={draft.x}
          y={draft.y}
          width={draft.width}
          height={draft.height}
          rotation={draft.rotation}
          // Hairline-alpha fill makes the rect's body a hit target so it can
          // be drag-translated; an outline-only Rect ignores body clicks.
          fill="rgba(0,0,0,0.001)"
          stroke="#818cf8"
          strokeWidth={1.5 / scale}
          draggable
          onDragEnd={onRectChange}
          onTransformEnd={onRectChange}
        />
      )}
      {draft.kind === 'rect' && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          ignoreStroke
          anchorSize={8}
          anchorCornerRadius={2}
          borderStroke="#818cf8"
          borderStrokeWidth={1.5}
          anchorStroke="#818cf8"
          anchorFill="#0a0a0a"
          rotateAnchorOffset={24}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4) return oldBox
            return newBox
          }}
        />
      )}
    </Group>
  )
}

// No-render component that subscribes to a window mouseup. Konva node
// pointer-up doesn't fire if the cursor leaves the listening rect mid-
// drag; this catches the release globally and finalizes the stroke.
function LassoUpCapture({
  active,
  onCommit,
}: {
  active: { current: boolean }
  onCommit: () => void
}) {
  useEffect(() => {
    const onUp = () => {
      if (!active.current) return
      active.current = false
      onCommit()
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
    // active is a ref; onCommit captures fresh store state via getState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// Ramer–Douglas–Peucker. Drops points that lie within `epsilon` of the
// straight segment between their neighbors; preserves shape while
// collapsing dense fixate-and-jiggle samples that lasso strokes produce.
// Operates on a flat [x, y, x, y, ...] array; returns the simplified array.
function rdpSimplify(pts: number[], epsilon: number): number[] {
  if (pts.length < 6) return pts
  const n = pts.length / 2
  const keep = new Array<boolean>(n).fill(false)
  keep[0] = true
  keep[n - 1] = true
  const stack: Array<[number, number]> = [[0, n - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = 0
    let idx = -1
    const sx = pts[s * 2]
    const sy = pts[s * 2 + 1]
    const ex = pts[e * 2]
    const ey = pts[e * 2 + 1]
    for (let i = s + 1; i < e; i++) {
      const px = pts[i * 2]
      const py = pts[i * 2 + 1]
      const d = perpDistance(px, py, sx, sy, ex, ey)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > epsilon && idx !== -1) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  }
  return out
}

function perpDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

// Returns the anchor index where a new point should be spliced so that
// the new anchor sits on the segment closest to (px, py). For an open
// polyline with N anchors we have N-1 segments [i, i+1]; for a closed
// polyline the wrap-around segment [N-1, 0] is also valid.
function nearestSegmentInsertIndex(
  points: number[],
  closed: boolean,
  px: number,
  py: number,
): number {
  const n = points.length / 2
  if (n < 2) return n
  let bestSeg = 0
  let bestD = Infinity
  const segCount = closed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n
    const d = perpDistance(
      px,
      py,
      points[i * 2],
      points[i * 2 + 1],
      points[j * 2],
      points[j * 2 + 1],
    )
    if (d < bestD) {
      bestD = d
      bestSeg = i
    }
  }
  // Splice between segment.start (i) and segment.end (i+1) → insert at i+1.
  return bestSeg + 1
}

function pointsToPathData(pts: number[]): string {
  if (pts.length < 4) return ''
  let d = `M${pts[0]},${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += ` L${pts[i]},${pts[i + 1]}`
  return d + ' Z'
}

// Renders the in-progress polygon: connecting segments, anchor dots, and a
// rubber-band line from the last placed point to the cursor. Lives in
// image-local coords (mounted inside the asset frame Group).
//
// Anchor roles while the polygon is still open:
//  - First anchor: the *close trigger*. Clicking it closes the loop. Not
//    draggable — clicking the close target should never accidentally
//    nudge the polygon's seam.
//  - Other anchors: draggable in polygon mode so users can nudge a placed
//    point before closing; read-only in lasso mode (the freehand stroke
//    is captured wholesale).
function PolygonDraftPreview({
  points,
  closed,
  cursor,
  scale,
  draggableAnchors,
  onAnchorDrag,
  onCloseLoop,
  onSegmentInsert,
  onAnchorDelete,
}: {
  points: number[]
  closed: boolean
  cursor: { x: number; y: number } | null
  scale: number
  draggableAnchors?: boolean
  onAnchorDrag?: (index: number, x: number, y: number) => void
  onCloseLoop?: () => void
  onSegmentInsert?: (insertIndex: number, x: number, y: number) => void
  onAnchorDelete?: (index: number) => void
}) {
  const stroke = '#818cf8'
  const sw = 1.5 / scale
  const dotR = 4 / scale
  return (
    <>
      {points.length >= 4 && (
        <Line
          points={points}
          stroke={stroke}
          strokeWidth={sw}
          closed={closed}
          // Listen + a wide hit stroke so clicks anywhere on a segment
          // reliably hit the polyline. The mousedown handler finds the
          // nearest segment and inserts a new anchor at the click point.
          listening={!!onSegmentInsert}
          hitStrokeWidth={onSegmentInsert ? 12 / scale : 0}
          onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
            if (!onSegmentInsert) return
            e.cancelBubble = true
            const group = e.target.getParent()
            const pos = group?.getRelativePointerPosition()
            if (!pos) return
            const insertIndex = nearestSegmentInsertIndex(points, closed, pos.x, pos.y)
            onSegmentInsert(insertIndex, pos.x, pos.y)
          }}
        />
      )}
      {!closed && cursor && points.length >= 2 && (
        <Line
          points={[points[points.length - 2], points[points.length - 1], cursor.x, cursor.y]}
          stroke={stroke}
          strokeWidth={sw}
          dash={[4 / scale, 3 / scale]}
          listening={false}
        />
      )}
      {points.length >= 2 &&
        Array.from({ length: points.length / 2 }, (_, i) => {
          const isFirst = i === 0
          // Close target only after at least 3 points are placed.
          const canClose = !closed && isFirst && points.length >= 6
          return (
            <Circle
              key={i}
              x={points[i * 2]}
              y={points[i * 2 + 1]}
              // First anchor reads larger so users see the close-loop
              // target. Others are smaller hot-spots to nudge.
              radius={isFirst && !closed ? dotR * 1.6 : dotR}
              fill={isFirst && !closed ? '#0a0a0a' : stroke}
              stroke={stroke}
              strokeWidth={sw}
              // Hit-stroke widens the click target so users don't need
              // pixel precision on the close anchor.
              hitStrokeWidth={canClose ? 14 / scale : 0}
              draggable={!!draggableAnchors && !isFirst}
              listening={!!draggableAnchors}
              onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
                // Stop the hit-rect underneath from receiving the click.
                // Without this, clicking the first anchor would also
                // append a new point at the same location and mask the
                // close gesture.
                e.cancelBubble = true
                // Alt-click → delete this specific anchor. Convention
                // borrowed from vector pen tools; works on any anchor
                // including the first.
                if (e.evt.altKey && onAnchorDelete) {
                  onAnchorDelete(i)
                  return
                }
                if (canClose) onCloseLoop?.()
              }}
              onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                if (!onAnchorDrag) return
                onAnchorDrag(i, e.target.x(), e.target.y())
              }}
            />
          )
        })}
    </>
  )
}
