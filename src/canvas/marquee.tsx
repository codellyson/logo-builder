import { Rect } from 'react-konva'

type Props = {
  rect: { x: number; y: number; width: number; height: number } | null
}

export function Marquee({ rect }: Props) {
  if (!rect) return null
  return (
    <Rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill="rgba(129, 140, 248, 0.12)"
      stroke="#818cf8"
      strokeWidth={1}
      listening={false}
    />
  )
}

export function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}
