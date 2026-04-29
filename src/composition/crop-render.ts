import type { ImageCrop } from '@/canvas/types'

// Traces the crop region into a 2D context — Konva's `clipFunc` calls this
// with its own ctx. Both the live render (NodeRenderer) and the crop edit
// overlay use the same routine so the editing preview matches the
// committed render exactly.
//
// Rect: rotate around the rect's center, draw an axis-aligned rect.
// Path: rebuild the polyline via Path2D and add it to the ctx — Path2D
// parses the SVG data without us needing a hand-rolled scanner.
export function traceCropPath(
  ctx: CanvasRenderingContext2D,
  crop: ImageCrop,
): void {
  if (crop.kind === 'rect') {
    const hw = crop.width / 2
    const hh = crop.height / 2
    ctx.save()
    ctx.translate(crop.x + hw, crop.y + hh)
    ctx.rotate((crop.rotation * Math.PI) / 180)
    ctx.rect(-hw, -hh, crop.width, crop.height)
    ctx.restore()
    return
  }
  // Path: Path2D.addPath isn't broadly supported on the implicit `clipFunc`
  // ctx, so emit the moves/lines manually from the parsed point sequence.
  const re = /([ML])\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  let started = false
  while ((m = re.exec(crop.data)) !== null) {
    const x = parseFloat(m[2])
    const y = parseFloat(m[3])
    if (m[1] === 'M' || !started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
}
