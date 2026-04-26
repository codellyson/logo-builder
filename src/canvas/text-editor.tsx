import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import type { TextNode } from '@/canvas/types'
import { useCanvasStore } from '@/state/canvas-store'
import { fillSolidColor } from '@/composition/fills'

type Props = {
  node: TextNode
  stage: Konva.Stage
  onClose: () => void
}

export function TextEditor({ node, stage, onClose }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const konvaNode = stage.findOne(`#${node.id}`) as Konva.Text | undefined
  if (!konvaNode) return null

  const bbox = konvaNode.getClientRect({ skipStroke: true, skipShadow: true })
  const stageBox = stage.container().getBoundingClientRect()
  const top = stageBox.top + bbox.y
  const left = stageBox.left + bbox.x
  const scale = stage.scaleX()

  return (
    <textarea
      ref={ref}
      defaultValue={node.text}
      spellCheck={false}
      onBlur={(e) => {
        useCanvasStore.getState().updateNode(node.id, { text: e.currentTarget.value })
        onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          useCanvasStore.getState().updateNode(node.id, { text: e.currentTarget.value })
          onClose()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      style={{
        position: 'fixed',
        top,
        left,
        width: node.width * scale,
        height: bbox.height,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize * scale,
        fontWeight: node.fontStyle.includes('bold') ? 700 : 400,
        fontStyle: node.fontStyle.includes('italic') ? 'italic' : 'normal',
        color: fillSolidColor(node.fill) ?? '#000000',
        letterSpacing: node.letterSpacing * scale,
        textAlign: node.align,
        lineHeight: 1,
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        caretColor: '#818cf8',
        zIndex: 50,
        transformOrigin: 'top left',
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
      }}
    />
  )
}
