import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '@/state/canvas-store'

type Props = {
  selectedIds: string[]
}

export function CanvasTransformer({ selectedIds }: Props) {
  const ref = useRef<Konva.Transformer>(null)
  const nodesData = useCanvasStore((s) => s.nodes)
  const hasGroup = selectedIds.some((id) => {
    const n = nodesData.find((x) => x.id === id)
    return n?.type === 'group'
  })

  useEffect(() => {
    const tr = ref.current
    if (!tr) return
    const stage = tr.getStage()
    if (!stage) return
    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n)
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds])

  return (
    <Transformer
      ref={ref}
      rotateEnabled
      resizeEnabled={!hasGroup}
      keepRatio={false}
      ignoreStroke
      anchorSize={8}
      anchorCornerRadius={2}
      borderStroke="#818cf8"
      borderStrokeWidth={1.5}
      anchorStroke="#818cf8"
      anchorFill="#0a0a0a"
      rotateAnchorOffset={24}
      boundBoxFunc={(_oldBox, newBox) => {
        if (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4) return _oldBox
        return newBox
      }}
    />
  )
}
