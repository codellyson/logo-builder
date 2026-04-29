import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Rect, Ellipse, Line, Text, Image as KonvaImage, Path, Group } from 'react-konva'
import type Konva from 'konva'
import type { AssetNode, CanvasNode, Effect, IconNode, RadialFill } from '@/canvas/types'
import { getAsset } from '@/persistence/assets'
import { useCanvasStore } from '@/state/canvas-store'
import { loadIconImage, loadIconImageWithGradient } from '@/icons/icon-svg'
import { polygonPoints, starPoints } from '@/composition/to-path'
import { fillKonvaProps, fillSolidColor, scaleFill, strokeKonvaProps } from '@/composition/fills'
import { traceCropPath } from '@/composition/crop-render'

type Props = {
  node: CanvasNode
  editing?: boolean
  children?: ReactNode
  onSelect: (id: string, additive: boolean) => void
  onStartTextEdit: (id: string) => void
  onEnterBoolean?: (id: string) => void
  ghosted?: boolean
}

type ShadowProps = {
  shadowEnabled?: boolean
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
}

// Konva renders one shadow per shape, so when multiple shadow-like effects
// are stacked we pick the topmost enabled one (last in the array). The
// missing ones still round-trip through SVG export — see effects.md.
function shadowPropsFromEffects(effects: Effect[] | undefined): ShadowProps {
  if (!effects || effects.length === 0) return {}
  for (let i = effects.length - 1; i >= 0; i--) {
    const eff = effects[i]
    if (!eff.enabled) continue
    if (eff.type === 'drop-shadow') {
      return {
        shadowEnabled: true,
        shadowColor: eff.color,
        shadowBlur: eff.blur,
        shadowOffsetX: eff.offsetX,
        shadowOffsetY: eff.offsetY,
        shadowOpacity: eff.opacity,
      }
    }
    if (eff.type === 'outer-glow') {
      return {
        shadowEnabled: true,
        shadowColor: eff.color,
        shadowBlur: eff.blur,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowOpacity: eff.opacity,
      }
    }
  }
  return {}
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

  // While this asset is being cropped, the CropOverlay owns the visual
  // (dim layer, bright preview, draft rect, transformer). Skipping the
  // normal render here avoids a duplicate / fighting transformer.
  const cropEditingId = useCanvasStore((s) => s.cropEditState?.nodeId ?? null)
  if (cropEditingId === node.id && node.type === 'asset') return null

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
    ...shadowPropsFromEffects(node.effects),
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
    return wrapRadialStroke(
      node,
      <Rect
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        width={node.width}
        height={node.height}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineJoin={node.strokeJoin ?? 'miter'}
        cornerRadius={node.cornerRadius}
      />,
    )
  }

  if (node.type === 'ellipse') {
    return wrapRadialStroke(
      node,
      <Ellipse
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        radiusX={node.radiusX}
        radiusY={node.radiusY}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
      />,
    )
  }

  if (node.type === 'line') {
    return wrapRadialStroke(
      node,
      <Line
        {...commonProps}
        points={node.points}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.strokeWidth}
        lineCap={node.strokeCap ?? 'butt'}
        lineJoin={node.strokeJoin ?? 'miter'}
        hitStrokeWidth={Math.max(12, node.strokeWidth)}
      />,
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
    return wrapRadialStroke(
      node,
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
      />,
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
    return wrapRadialStroke(
      node,
      <Path
        {...commonProps}
        {...fillKonvaProps(node.fill)}
        {...ghostProps}
        data={cache.data}
        {...strokeKonvaProps(node.stroke)}
        strokeWidth={node.stroke ? node.strokeWidth : 0}
        lineJoin={node.strokeJoin ?? 'miter'}
      />,
      ghosted,
    )
  }

  if (node.type === 'asset') {
    const enterCrop = () => useCanvasStore.getState().enterImageCrop(node.id)
    return (
      <AssetKonva
        node={node}
        commonProps={{ ...commonProps, onDblClick: enterCrop, onDblTap: enterCrop }}
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
  return wrapRadialStroke(
    node,
    <Line
      {...(commonProps as object)}
      {...fillKonvaProps(node.fill)}
      points={points}
      closed
      {...strokeKonvaProps(node.stroke)}
      strokeWidth={node.stroke ? node.strokeWidth : 0}
      lineJoin={node.strokeJoin ?? 'miter'}
    />,
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
  return wrapRadialStroke(
    node,
    <Line
      {...(commonProps as object)}
      {...fillKonvaProps(node.fill)}
      points={points}
      closed
      {...strokeKonvaProps(node.stroke)}
      strokeWidth={node.stroke ? node.strokeWidth : 0}
      lineJoin={node.strokeJoin ?? 'miter'}
    />,
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

// Renders a user-uploaded asset (raster or embedded SVG). Loads the
// asset's Blob from IndexedDB via createObjectURL and binds it to a
// Konva.Image; revokes the URL on unmount or assetId change. Missing
// assets (deleted while a node still references them) render a placeholder
// so the canvas doesn't crash and the user gets a visual cue.
function AssetKonva({
  node,
  commonProps,
}: {
  node: AssetNode
  commonProps: Record<string, unknown>
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setImage(null)
    setMissing(false)
    void getAsset(node.assetId).then((rec) => {
      if (cancelled) return
      if (!rec) {
        setMissing(true)
        return
      }
      url = URL.createObjectURL(rec.blob)
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImage(img)
      }
      img.onerror = () => {
        if (!cancelled) setMissing(true)
      }
      img.src = url
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [node.assetId])

  if (missing) {
    return (
      <Rect
        {...(commonProps as object)}
        width={node.width}
        height={node.height}
        fill="#1f1f23"
        stroke="#4b5563"
        strokeWidth={1}
        dash={[4, 4]}
      />
    )
  }

  // Crop set → pre-render to an offscreen canvas sized to the crop AABB.
  // We can't use `clipFunc` on a Konva Group because `getClientRect` (the
  // metric the transformer / alignment / selection bbox all read) ignores
  // it — the user would see crop visually correct but a transformer that
  // still wraps the full source raster. Pre-rendering bakes the clip into
  // a Konva.Image whose native bounds *are* the cropped region.
  const c = node.crop
  if (c) {
    return (
      <CroppedAssetKonva
        node={node}
        image={image}
        crop={c}
        commonProps={commonProps}
      />
    )
  }

  return (
    <KonvaImage
      {...(commonProps as object)}
      image={image ?? undefined}
      width={node.width}
      height={node.height}
    />
  )
}

function CroppedAssetKonva({
  node,
  image,
  crop,
  commonProps,
}: {
  node: AssetNode
  image: HTMLImageElement | null
  crop: NonNullable<AssetNode['crop']>
  commonProps: Record<string, unknown>
}) {
  // Cropped frame: source image rasterized through the clip path. The
  // canvas size matches the crop's AABB exactly so Konva.Image.bounds
  // reflects the visible region. Re-renders only when the source image,
  // crop shape, or original image dimensions change — drag/transform
  // gestures don't touch any of these.
  const cropped = useMemo(() => {
    if (!image) return null
    const aabb = cropAABB(crop)
    if (aabb.width <= 0 || aabb.height <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(aabb.width))
    canvas.height = Math.max(1, Math.ceil(aabb.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.beginPath()
    // Shift the crop path so the AABB's top-left becomes (0, 0) in the
    // canvas; the source image then draws at the same negative offset.
    ctx.save()
    ctx.translate(-aabb.x, -aabb.y)
    traceCropPath(ctx, crop)
    ctx.restore()
    ctx.clip()
    ctx.drawImage(image, -aabb.x, -aabb.y, node.width, node.height)
    return { canvas, aabb }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, crop, node.width, node.height])

  if (!cropped) return null
  // Drag end commits target.x()/y() back to node.x/y. For a cropped image
  // the rendered Konva node sits offset by cropAABB.{x,y}, so we subtract
  // the offset before saving — otherwise each drag would compound the
  // offset and the source would walk off the visible frame.
  const baseDragEnd = commonProps.onDragEnd as
    | ((e: Konva.KonvaEventObject<DragEvent>) => void)
    | undefined
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target.id() !== node.id) {
      baseDragEnd?.(e)
      return
    }
    useCanvasStore.getState().updateNode(node.id, {
      x: e.target.x() - cropped.aabb.x,
      y: e.target.y() - cropped.aabb.y,
    })
  }
  return (
    <KonvaImage
      {...(commonProps as object)}
      image={cropped.canvas}
      x={(commonProps.x as number) + cropped.aabb.x}
      y={(commonProps.y as number) + cropped.aabb.y}
      width={cropped.aabb.width}
      height={cropped.aabb.height}
      onDragEnd={onDragEnd}
    />
  )
}

// Scales a crop's coords by (sx, sy). Rect: x/y/w/h scale; rotation is
// preserved (non-uniform scale + rotation is a known approximation — fine
// for v1 since users mostly resize uniformly). Path: every point scales.
function scaleAssetCrop(
  crop: NonNullable<AssetNode['crop']>,
  sx: number,
  sy: number,
): NonNullable<AssetNode['crop']> {
  if (crop.kind === 'rect') {
    return {
      kind: 'rect',
      x: crop.x * sx,
      y: crop.y * sy,
      width: Math.max(0.5, crop.width * sx),
      height: Math.max(0.5, crop.height * sy),
      rotation: crop.rotation,
    }
  }
  const scaled = crop.data.replace(
    /([ML])\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g,
    (_, cmd: string, xStr: string, yStr: string) =>
      `${cmd}${parseFloat(xStr) * sx},${parseFloat(yStr) * sy}`,
  )
  return { kind: 'path', data: scaled }
}

// AABB of the crop region in image-local coords. Mirrors the rect-corner
// rotation in bbox.ts but kept inline here so the render path doesn't pull
// the bbox module's full surface for one helper.
function cropAABB(crop: NonNullable<AssetNode['crop']>): {
  x: number
  y: number
  width: number
  height: number
} {
  const pts: number[] = []
  if (crop.kind === 'rect') {
    const hw = crop.width / 2
    const hh = crop.height / 2
    const cx = crop.x + hw
    const cy = crop.y + hh
    const rad = (crop.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    for (const [ox, oy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as Array<[number, number]>) {
      pts.push(cx + ox * cos - oy * sin, cy + ox * sin + oy * cos)
    }
  } else {
    const re = /[ML]\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(crop.data)) !== null) {
      pts.push(parseFloat(m[1]), parseFloat(m[2]))
    }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i]
    if (pts[i] > maxX) maxX = pts[i]
    if (pts[i + 1] < minY) minY = pts[i + 1]
    if (pts[i + 1] > maxY) maxY = pts[i + 1]
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// Konva 10.2.5 has no `_strokeRadialGradient` — radial stroke props on a
// shape are silently dropped. Workaround: render an extra Konva.Path whose
// data is the expanded stroke outline, filled with the radial gradient.
// `strokeKonvaProps` already disables the native stroke for radial fills,
// so the main shape draws no stroke and the overlay is the only thing
// the user sees in that region.
function wrapRadialStroke(
  node: CanvasNode,
  shape: ReactNode,
  ghosted?: boolean,
): ReactNode {
  if (!('stroke' in node) || !node.stroke || node.stroke.type !== 'radial') {
    return shape
  }
  return (
    <>
      {shape}
      <RadialStrokeOverlay node={node} stroke={node.stroke} ghosted={!!ghosted} />
    </>
  )
}

function RadialStrokeOverlay({
  node,
  stroke,
  ghosted,
}: {
  node: CanvasNode
  stroke: RadialFill
  ghosted: boolean
}) {
  // Recompute when the node identity changes — zustand creates new node
  // references on every store update, so this re-runs only on real
  // changes. stroke-outline pulls paper.js, so we dynamic-import it on
  // first need: the very first radial-stroke render skips a frame while
  // paper loads, then settles. Subsequent recomputes are sync because
  // the module is cached in the browser.
  const [data, setData] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('@/composition/stroke-outline').then((m) => {
      if (cancelled) return
      setData(m.computeStrokeOutlinePathData(node))
    })
    return () => {
      cancelled = true
    }
  }, [node])
  if (!data) return null
  const opacity = ghosted ? node.opacity * 0.4 : node.opacity
  return (
    <Path
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={opacity}
      globalCompositeOperation={node.blendMode ?? 'source-over'}
      data={data}
      {...fillKonvaProps(stroke)}
      listening={false}
    />
  )
}

async function bakeScale(node: CanvasNode, scaleX: number, scaleY: number, target: Konva.Node) {
  const update = useCanvasStore.getState().updateNode
  const x = target.x()
  const y = target.y()
  const rotation = target.rotation()
  // path / boolean baking needs paper.js to scale the path data — pull
  // it lazily so it isn't in the initial bundle. Other node types (rect,
  // ellipse, etc.) don't need paper at all.
  const needsPaper = node.type === 'path' || node.type === 'boolean'
  const scalePath = needsPaper
    ? (await import('@/composition/paper-bridge')).scalePath
    : null

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
      data: scalePath!(node.data, scaleX, scaleY),
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
  } else if (node.type === 'asset') {
    if (node.crop) {
      // Scale the crop in lockstep with the source dims so the visible
      // region grows / shrinks together with the underlying raster. After
      // scaling, the rendered Konva.Image still sits offset by the new
      // crop AABB — subtract that offset so node.{x,y} stays anchored to
      // the *source* origin (the same convention as no-crop).
      const scaledCrop = scaleAssetCrop(node.crop, scaleX, scaleY)
      const aabb = cropAABB(scaledCrop)
      update(node.id, {
        x: x - aabb.x,
        y: y - aabb.y,
        rotation,
        width: Math.max(1, node.width * scaleX),
        height: Math.max(1, node.height * scaleY),
        crop: scaledCrop,
      })
    } else {
      update(node.id, {
        x,
        y,
        rotation,
        width: Math.max(1, node.width * scaleX),
        height: Math.max(1, node.height * scaleY),
      })
    }
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
        data: scalePath!(node.cache.data, scaleX, scaleY),
        width: Math.max(1, node.cache.width * scaleX),
        height: Math.max(1, node.cache.height * scaleY),
        version: Date.now(),
      },
      fill: scaleFill(node.fill, scaleX, scaleY),
      stroke: scaleFill(node.stroke, scaleX, scaleY),
    })
  }
}
