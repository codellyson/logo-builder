export type Bbox = { x: number; y: number; width: number; height: number }

export type SnapGuide = {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

type SnapResult = {
  dx: number
  dy: number
  guides: SnapGuide[]
}

function candidateLines(b: Bbox, axis: 'x' | 'y'): number[] {
  if (axis === 'x') return [b.x, b.x + b.width / 2, b.x + b.width]
  return [b.y, b.y + b.height / 2, b.y + b.height]
}

export function computeSnap(
  dragged: Bbox,
  others: Bbox[],
  artboard: Bbox,
  threshold: number,
): SnapResult {
  const targets = [...others, artboard]
  let bestDx = 0
  let bestDy = 0
  let minXDist = threshold + 1
  let minYDist = threshold + 1
  const guides: SnapGuide[] = []

  const dxLines = candidateLines(dragged, 'x')
  const dyLines = candidateLines(dragged, 'y')

  for (const t of targets) {
    for (const tx of candidateLines(t, 'x')) {
      for (const dx of dxLines) {
        const dist = Math.abs(dx - tx)
        if (dist <= threshold && dist < minXDist) {
          minXDist = dist
          bestDx = tx - dx
        }
      }
    }
    for (const ty of candidateLines(t, 'y')) {
      for (const dy of dyLines) {
        const dist = Math.abs(dy - ty)
        if (dist <= threshold && dist < minYDist) {
          minYDist = dist
          bestDy = ty - dy
        }
      }
    }
  }

  // recompute guides for the applied snap
  if (minXDist <= threshold) {
    const snappedX = dragged.x + bestDx
    const snappedCenter = snappedX + dragged.width / 2
    const snappedRight = snappedX + dragged.width
    for (const t of targets) {
      for (const tx of candidateLines(t, 'x')) {
        if (
          Math.abs(tx - snappedX) < 0.5 ||
          Math.abs(tx - snappedCenter) < 0.5 ||
          Math.abs(tx - snappedRight) < 0.5
        ) {
          const yStart = Math.min(dragged.y + bestDy, t.y)
          const yEnd = Math.max(dragged.y + bestDy + dragged.height, t.y + t.height)
          guides.push({ axis: 'x', position: tx, start: yStart, end: yEnd })
        }
      }
    }
  }
  if (minYDist <= threshold) {
    const snappedY = dragged.y + bestDy
    const snappedCenter = snappedY + dragged.height / 2
    const snappedBottom = snappedY + dragged.height
    for (const t of targets) {
      for (const ty of candidateLines(t, 'y')) {
        if (
          Math.abs(ty - snappedY) < 0.5 ||
          Math.abs(ty - snappedCenter) < 0.5 ||
          Math.abs(ty - snappedBottom) < 0.5
        ) {
          const xStart = Math.min(dragged.x + bestDx, t.x)
          const xEnd = Math.max(dragged.x + bestDx + dragged.width, t.x + t.width)
          guides.push({ axis: 'y', position: ty, start: xStart, end: xEnd })
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, guides }
}
