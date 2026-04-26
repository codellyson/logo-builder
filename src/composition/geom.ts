// Snaps `pos` so the vector from `anchor` to `pos` is along the nearest 0° /
// 45° / 90° direction. If anchor is null, returns pos unchanged. Used by the
// pen tool's Shift-constrain placement and by the gradient handle overlay's
// Shift-constrain drag.
export function constrainToAxis(
  pos: { x: number; y: number },
  anchor: { x: number; y: number } | null,
): { x: number; y: number } {
  if (!anchor) return pos
  const dx = pos.x - anchor.x
  const dy = pos.y - anchor.y
  const angle = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snapped = Math.round(angle / step) * step
  const mag = Math.hypot(dx, dy)
  return { x: anchor.x + Math.cos(snapped) * mag, y: anchor.y + Math.sin(snapped) * mag }
}
