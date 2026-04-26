import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Rect, Ellipse, Line, Text, Image as KonvaImage, Path, Group } from 'react-konva'
import type Konva from 'konva'
import type { CanvasNode, IconNode } from '@/canvas/types'
import { useCanvasStore } from '@/state/canvas-store'
import { loadIconImage, loadIconImageWithGradient } from '@/icons/icon-svg'
import { scalePath } from '@/composition/paper-bridge'
import { polygonPoints, starPoints } from '@/composition/to-path'
import { fillKonvaProps, fillSolidColor, scaleFill, strokeKonvaProps } from '@/composition/fills'

type Props = {
  node: CanvasNode
  editing?: boolean
  children?: ReactNode
  onSelect: (id: string, additive: boolean) => void
  onStartTextEdit: (id: string) => void
  onEnterBoolean?: (id: string) => void
  ghosted?: boolean
}

export function NodeRenderer({
  node,
  editing,
  children,
  onSelect,
  onStartTextEdit,
  onEnterBoolean,
  ghosted,
}: Props) {
  if (node.hidden) return null

  const updateNode = useCanvasStore.getState().updateNode

  const hasGroupParent = !!node.parentId

  const commonProps = {
    id: node.id,
    name: 'canvas-node',
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    opacity: node.opacity,
    visible: !editing,
    globalCompositeOperation: node.blendMode ?? 'source-over',
    draggable:
      !node.locked &&
      useCanvasStore.getState().toolMode !== 'pen' &&
      useCanvasStore.getState().toolMode !== 'edit-path',
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const mode = useCanvasStore.getState().toolMode
      // Pen mode: let the click bubble to the stage so it becomes an anchor.
      // Edit-path mode: the overlay handles anchor clicks; node body clicks
      // should also fall through so empty clicks inside the bbox don't select.
      if (mode === 'pen' || mode === 'edit-path') return
      e.cancelBubble = true
      onSelect(node.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)
    },
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (!hasGroupParent) return
      const target = e.target
      let ancestor: Konva.Node = target
      while (
        ancestor.parent &&
        ancestor.parent.getClassName() === 'Group' &&
        ancestor.parent.id()
      ) {
        ancestor = ancestor.parent as Konva.Node
      }
      if (ancestor !== target && ancestor.getClassName() === 'Group') {
        target.stopDrag()
        ;(ancestor as Konva.Group).startDrag()
      }
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target.id() !== node.id) return
      updateNode(node.id, { x: e.target.x(), y: e.target.y() })
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const target = e.target
      const scaleX = target.scaleX()
      const scaleY = target.scaleY()
      target.scaleX(1)
      target.scaleY(1)
      bakeScale(node, scaleX, scaleY, target)
    },
  }

  if (node.type === 'rect') {
    return (
      <Rect
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        width={node.width}
        height={node.height}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineJoin={node.strokeJoin ?? 'miter'}
        cornerRadius={node.cornerRadius}
      />
    )
  }

  if (node.type === 'ellipse') {
    return (
      <Ellipse
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        radiusX={node.radiusX}
        radiusY={node.radiusY}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
      />
    )
  }

  if (node.type === 'line') {
    return (
      <Line
        {...commonProps}
        points={node.points}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.strokeWidth}
        lineCap={node.strokeCap ?? 'butt'}
        lineJoin={node.strokeJoin ?? 'miter'}
        hitStrokeWidth={Math.max(12, node.strokeWidth)}
      />
    )
  }

  if (node.type === 'polygon') {
    return <PolygonKonva node={node} commonProps={commonProps} />
  }

  if (node.type === 'star') {
    return <StarKonva node={node} commonProps={commonProps} />
  }

  if (node.type === 'text') {
    return (
      <Text
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        text={node.text}
        fontFamily={node.fontFamily}
        fontSize={node.fontSize}
        fontStyle={node.fontStyle}
        align={node.align}
        letterSpacing={node.letterSpacing}
        width={node.width}
        onDblClick={() => onStartTextEdit(node.id)}
        onDblTap={() => onStartTextEdit(node.id)}
      />
    )
  }

  if (node.type === 'path') {
    return (
      <Path
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        data={node.data}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineCap={node.strokeCap ?? 'butt'}
        lineJoin={node.strokeJoin ?? 'miter'}
        onDblClick={() => useCanvasStore.getState().enterPathEdit(node.id)}
        onDblTap={() => useCanvasStore.getState().enterPathEdit(node.id)}
      />
    )
  }

  if (node.type === 'group') {
    return <Group {...commonProps}>{children}</Group>
  }

  if (node.type === 'boolean') {
    const cache = node.cache
    if (!cache || !cache.data) return null
    const ghostProps = ghosted
      ? { listening: false, opacity: node.opacity * 0.4, draggable: false }
      : {
          onDblClick: () => onEnterBoolean?.(node.id),
          onDblTap: () => onEnterBoolean?.(node.id),
        }
    return (
      <Path
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        {...ghostProps}
        data={cache.data}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineJoin={node.strokeJoin ?? 'miter'}
      />
    )
  }

  return <IconKonva node={node} commonProps={commonProps} />
}

function PolygonKonva({
  node,
  commonProps,
}: {
  node: Extract<CanvasNode, { type: 'polygon' }>
  commonProps: Record<string, unknown>
}) {
  const points = useMemo(() => polygonPoints(node.sides, node.radius), [node.sides, node.radius])
  return (
    <Line
      {...(commonProps as object)}
      {...fillKonvaProps(node.fill)}
      points={points}
      closed
      {...strokeKonvaProps(node.stroke)}
      strokeWidth={node.stroke ? node.strokeWidth : 0}
      lineJoin={node.strokeJoin ?? 'miter'}
    />
  )
}

function StarKonva({
  node,
  commonProps,
}: {
  node: Extract<CanvasNode, { type: 'star' }>
  commonProps: Record<string, unknown>
}) {
  const points = useMemo(
    () => starPoints(node.points, node.outerRadius, node.innerRadius),
    [node.points, node.outerRadius, node.innerRadius],
  )
  return (
    <Line
      {...(commonProps as object)}
      {...fillKonvaProps(node.fill)}
      points={points}
      closed
      {...strokeKonvaProps(node.stroke)}
      strokeWidth={node.stroke ? node.strokeWidth : 0}
      lineJoin={node.strokeJoin ?? 'miter'}
    />
  )
}

function IconKonva({
  node,
  commonProps,
}: {
  node: IconNode
  commonProps: Record<string, unknown>
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  // Solid → fetch iconify SVG with the color baked in. Gradient → fetch
  // sentinel-colored SVG, rewrite all fill attrs to a `url(#id)` ref, inject
  // the gradient def inline, and rasterize. Multi-color icons collapse to a
  // single gradient by design (the panel surfaces this).
  const fill = node.fill
  const isGradient = fill.type !== 'solid'
  const iconColor = !isGradient ? fillSolidColor(fill) ?? '#000000' : ''
  // Serialize the gradient so the effect re-runs only when content changes,
  // not when a new fill object with identical content arrives.
  const fillKey = isGradient ? JSON.stringify(fill) : iconColor

  useEffect(() => {
    let cancelled = false
    const promise = isGradient
      ? loadIconImageWithGradient(
          node.iconName,
          fill as Exclude<typeof fill, { type: 'solid' }>,
          node.width,
          node.height,
        )
      : loadIconImage(node.iconName, iconColor)
    promise.then((img) => {
      if (!cancelled) setImage(img)
    })
    return () => {
      cancelled = true
    }
    // fillKey carries the gradient/solid identity for the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.iconName, fillKey, node.width, node.height])

  return (
    <KonvaImage
      {...(commonProps as object)}
      image={image ?? undefined}
      width={node.width}
      height={node.height}
    />
  )
}

function bakeScale(node: CanvasNode, scaleX: number, scaleY: number, target: Konva.Node) {
  const update = useCanvasStore.getState().updateNode
  const x = target.x()
  const y = target.y()
  const rotation = target.rotation()

  if (node.type === 'rect') {
    update(node.id, {
      x,
      y,
      rotation,
      width: Math.max(1, node.width * scaleX),
      height: Math.max(1, node.height * scaleY),
      fill: scaleFill(node.fill, scaleX, scaleY) ?? node.fill,
      stroke: scaleFill(node.stroke, scaleX, scaleY),
    })
  } else if (node.type === 'ellipse') {
    update(node.id, {
      x,
      y,
      rotation,
      radiusX: Math.max(1, node.radiusX * scaleX),
      radiusY: Math.max(1, node.radiusY * scaleY),
      fill: scaleFill(node.fill, scaleX, scaleY) ?? node.fill,
      stroke: scaleFill(node.stroke, scaleX, scaleY),
    })
  } else if (node.type === 'line') {
    update(node.id, {
      x,
      y,
      rotation,
      points: node.points.map((p, i) => (i % 2 === 0 ? p * scaleX : p * scaleY)),
      stroke: scaleFill(node.stroke, scaleX, scaleY) ?? node.stroke,
    })
  } else if (node.type === 'text') {
    update(node.id, {
      x,
      y,
      rotation,
      fontSize: Math.max(4, node.fontSize * scaleY),
      width: Math.max(20, node.width * scaleX),
      fill: scaleFill(node.fill, scaleX, scaleY) ?? node.fill,
    })
  } else if (node.type === 'icon') {
    update(node.id, {
      x,
      y,
      rotation,
      width: Math.max(8, node.width * scaleX),
      height: Math.max(8, node.height * scaleY),
      fill: scaleFill(node.fill, scaleX, scaleY) ?? node.fill,
    })
  } else if (node.type === 'path') {
    update(node.id, {
      x,
      y,
      rotation,
      data: scalePath(node.data, scaleX, scaleY),
      width: Math.max(1, node.width * scaleX),
      height: Math.max(1, node.height * scaleY),
      fill: scaleFill(node.fill, scaleX, scaleY),
      stroke: scaleFill(node.stroke, scaleX, scaleY),
    })
  } else if (node.type === 'polygon') {
    // Polygon/star use uniform-avg scale because their geometry is parametric
    // off a single radius. Match that for the gradient so the ramp scales
    // proportionally instead of skewing.
    const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
    update(node.id, {
      x,
      y,
      rotation,
      radius: Math.max(1, node.radius * avg),
      fill: scaleFill(node.fill, avg, avg) ?? node.fill,
      stroke: scaleFill(node.stroke, avg, avg),
    })
  } else if (node.type === 'star') {
    const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
    update(node.id, {
      x,
      y,
      rotation,
      outerRadius: Math.max(1, node.outerRadius * avg),
      innerRadius: Math.max(1, node.innerRadius * avg),
      fill: scaleFill(node.fill, avg, avg) ?? node.fill,
      stroke: scaleFill(node.stroke, avg, avg),
    })
  } else if (node.type === 'group') {
    update(node.id, { x, y, rotation })
  } else if (node.type === 'boolean') {
    if (!node.cache || !node.cache.data) {
      update(node.id, { x, y, rotation })
      return
    }
    update(node.id, {
      x,
      y,
      rotation,
      cache: {
        data: scalePath(node.cache.data, scaleX, scaleY),
        width: Math.max(1, node.cache.width * scaleX),
        height: Math.max(1, node.cache.height * scaleY),
        version: Date.now(),
      },
      fill: scaleFill(node.fill, scaleX, scaleY),
      stroke: scaleFill(node.stroke, scaleX, scaleY),
    })
  }
}
