import { Line } from 'react-konva'
import type { SnapGuide } from '@/composition/alignment'

type Props = {
  guides: SnapGuide[]
  scale: number
}

export function Guides({ guides, scale }: Props) {
  return (
    <>
      {guides.map((g, i) => {
        const points =
          g.axis === 'x'
            ? [g.position, g.start, g.position, g.end]
            : [g.start, g.position, g.end, g.position]
        return (
          <Line
            key={i}
            points={points}
            stroke="#f472b6"
            strokeWidth={1 / scale}
            listening={false}
            dash={[6 / scale, 4 / scale]}
          />
        )
      })}
    </>
  )
}
