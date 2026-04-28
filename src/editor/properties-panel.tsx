import { useCanvasStore } from '@/state/canvas-store'
import {
  getSegmentStyle,
  parseSegments,
  setSegmentStyles,
  type SegmentStyle,
} from '@/composition/path-edit-ops'
import type {
  AssetNode,
  BlendMode,
  BooleanNode,
  BooleanOp,
  CanvasNode,
  EllipseNode,
  GroupNode,
  IconNode,
  LineNode,
  LockupRole,
  PathNode,
  PolygonNode,
  RectNode,
  StarNode,
  StrokeCap,
  StrokeJoin,
  TextNode,
} from '@/canvas/types'

// Fallback bbox for FillEditor when getNodeLocalBbox returns null (e.g. a
// boolean with no resolved cache yet). Gradient defaults seeded from this
// won't be perfectly fitted but they're recoverable via on-canvas handles.
const FILL_BBOX_FALLBACK = { x: 0, y: 0, width: 100, height: 100 }

const CAP_OPTIONS: { value: StrokeCap; label: string }[] = [
  { value: 'butt', label: 'Butt' },
  { value: 'round', label: 'Round' },
]

const JOIN_OPTIONS: { value: StrokeJoin; label: string }[] = [
  { value: 'miter', label: 'Miter' },
  { value: 'round', label: 'Round' },
  { value: 'bevel', label: 'Bevel' },
]
import { ColorPicker } from '@/colors/color-picker'
import { FontPicker } from '@/fonts/font-picker'
import { IconPicker } from '@/icons/icon-picker'
import { FillEditor } from '@/editor/properties/fill-editor'
import { EffectsSection } from '@/editor/properties/effects-section'
import { getNodeLocalBbox } from '@/composition/bbox'
import { FieldRow, NumberField, Segmented, Slider01, TextField, TextAreaField } from '@/ui/fields'
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { getAsset } from '@/persistence/assets'
import type { AssetRecord } from '@/persistence/db'
import { svgAssetToPaths } from '@/composition/svg-asset-to-path'
import { solidFill } from '@/composition/fills'
import { newId } from '@/lib/id'

export function PropertiesPanel() {
  const nodes = useCanvasStore((s) => s.nodes)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const toolMode = useCanvasStore((s) => s.toolMode)
  const pathEditState = useCanvasStore((s) => s.pathEditState)
  const selected = nodes.filter((n) => selectedIds.includes(n.id))

  // In edit-path mode with one or more anchors selected, show anchor properties.
  if (toolMode === 'edit-path' && pathEditState && pathEditState.selectedSegmentIndices.length > 0) {
    const node = nodes.find((n) => n.id === pathEditState.nodeId)
    if (node && node.type === 'path') {
      return (
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Anchor
          </div>
          <div className="p-3">
            <AnchorFields
              nodeId={node.id}
              pathData={node.data}
              indices={pathEditState.selectedSegmentIndices}
            />
          </div>
        </div>
      )
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-3 pt-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
        Properties
      </div>
      <div className="p-3">
        {selected.length === 0 && <ArtboardEditor />}
        {selected.length === 1 && <SingleEditor node={selected[0]} />}
        {selected.length > 1 && <MultiInfo count={selected.length} />}
      </div>
    </div>
  )
}

function ArtboardEditor() {
  const artboardBackground = useCanvasStore((s) => s.artboardBackground)
  const setArtboardBackground = useCanvasStore((s) => s.setArtboardBackground)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const setStageSize = useCanvasStore((s) => s.setStageSize)

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Artboard</div>
      <FieldRow label="Background">
        <ColorPicker
          value={artboardBackground}
          onChange={(hex) => hex && setArtboardBackground(hex)}
        />
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Width">
          <NumberField
            value={stageWidth}
            min={16}
            onCommit={(n) => setStageSize(n, stageHeight)}
          />
        </FieldRow>
        <FieldRow label="Height">
          <NumberField
            value={stageHeight}
            min={16}
            onCommit={(n) => setStageSize(stageWidth, n)}
          />
        </FieldRow>
      </div>
      <div className="pt-1 text-[10px] text-neutral-600">
        Select a layer to edit its properties.
      </div>
    </div>
  )
}

function MultiInfo({ count }: { count: number }) {
  return (
    <div className="text-xs text-neutral-500">
      {count} layers selected. Use the Palette panel to apply colors in bulk.
    </div>
  )
}

function SingleEditor({ node }: { node: CanvasNode }) {
  return (
    <div className="space-y-4">
      <CommonFields node={node} />
      {node.type === 'rect' && <RectFields node={node} />}
      {node.type === 'ellipse' && <EllipseFields node={node} />}
      {node.type === 'line' && <LineFields node={node} />}
      {node.type === 'text' && <TextFields node={node} />}
      {node.type === 'icon' && <IconFields node={node} />}
      {node.type === 'asset' && <AssetFields node={node} />}
      {node.type === 'path' && <PathFields node={node} />}
      {node.type === 'polygon' && <PolygonFields node={node} />}
      {node.type === 'star' && <StarFields node={node} />}
      {node.type === 'boolean' && <BooleanFields node={node} />}
      {(node.type === 'group' || node.type === 'boolean') && (
        <LockupRoleField node={node} />
      )}
      <EffectsSection node={node} />
    </div>
  )
}

function StarFields({ node }: { node: StarNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Points">
        <NumberField
          value={node.points}
          min={3}
          max={32}
          onCommit={(n) => update(node.id, { points: Math.max(3, Math.min(32, Math.round(n))) })}
        />
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Outer Radius">
          <NumberField
            value={node.outerRadius}
            min={1}
            onCommit={(n) => update(node.id, { outerRadius: n })}
          />
        </FieldRow>
        <FieldRow label="Inner Radius">
          <NumberField
            value={node.innerRadius}
            min={1}
            onCommit={(n) => update(node.id, { innerRadius: Math.max(1, Math.min(node.outerRadius - 1, n)) })}
          />
        </FieldRow>
      </div>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <>
          <FieldRow label="Stroke Width">
            <NumberField
              value={node.strokeWidth}
              min={0}
              onCommit={(n) => update(node.id, { strokeWidth: n })}
            />
          </FieldRow>
          <FieldRow label="Join">
            <Segmented<StrokeJoin>
              value={node.strokeJoin ?? 'miter'}
              options={JOIN_OPTIONS}
              onChange={(v) => update(node.id, { strokeJoin: v })}
            />
          </FieldRow>
        </>
      )}
    </div>
  )
}

function PolygonFields({ node }: { node: PolygonNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Sides">
          <NumberField
            value={node.sides}
            min={3}
            max={64}
            onCommit={(n) => update(node.id, { sides: Math.max(3, Math.min(64, Math.round(n))) })}
          />
        </FieldRow>
        <FieldRow label="Radius">
          <NumberField
            value={node.radius}
            min={1}
            onCommit={(n) => update(node.id, { radius: n })}
          />
        </FieldRow>
      </div>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <>
          <FieldRow label="Stroke Width">
            <NumberField
              value={node.strokeWidth}
              min={0}
              onCommit={(n) => update(node.id, { strokeWidth: n })}
            />
          </FieldRow>
          <FieldRow label="Join">
            <Segmented<StrokeJoin>
              value={node.strokeJoin ?? 'miter'}
              options={JOIN_OPTIONS}
              onChange={(v) => update(node.id, { strokeJoin: v })}
            />
          </FieldRow>
        </>
      )}
    </div>
  )
}

function AnchorFields({
  nodeId,
  pathData,
  indices,
}: {
  nodeId: string
  pathData: string
  indices: number[]
}) {
  const update = useCanvasStore((s) => s.updateNode)
  const segs = parseSegments(pathData)
  const styles = indices.map((i) => (segs[i] ? getSegmentStyle(segs[i]) : null)).filter((s): s is SegmentStyle => !!s)
  const uniform = styles.length > 0 && styles.every((s) => s === styles[0])
  const currentStyle: SegmentStyle | null = uniform ? styles[0] : null

  const applyStyle = (style: SegmentStyle) => {
    const next = setSegmentStyles(pathData, indices, style)
    if (next) update(nodeId, { data: next })
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-neutral-500">
        {indices.length} anchor{indices.length === 1 ? '' : 's'} selected
      </div>
      <FieldRow label="Style">
        <Segmented<SegmentStyle>
          value={currentStyle ?? 'corner'}
          options={[
            { value: 'corner', label: 'Corner' },
            { value: 'smooth', label: 'Smooth' },
            { value: 'cusp', label: 'Cusp' },
          ]}
          onChange={applyStyle}
        />
      </FieldRow>
      {!uniform && (
        <div className="text-[10px] text-neutral-600">Selected anchors have mixed styles.</div>
      )}
      <div className="pt-2 text-[10px] text-neutral-600">
        Shortcuts: 1 Corner · 2 Smooth · 3 Cusp
      </div>
    </div>
  )
}

function BooleanFields({ node }: { node: BooleanNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  const changeBooleanOp = useCanvasStore((s) => s.changeBooleanOp)
  const flattenBoolean = useCanvasStore((s) => s.flattenBoolean)
  const canFlatten = !!node.cache && !!node.cache.data
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Op">
        <Segmented<BooleanOp>
          value={node.op}
          options={[
            { value: 'unite', label: 'Union' },
            { value: 'subtract', label: 'Sub' },
            { value: 'intersect', label: 'Int' },
            { value: 'exclude', label: 'XOR' },
          ]}
          onChange={(v) => changeBooleanOp(node.id, v)}
        />
      </FieldRow>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <>
          <FieldRow label="Stroke Width">
            <NumberField
              value={node.strokeWidth}
              min={0}
              onCommit={(n) => update(node.id, { strokeWidth: n })}
            />
          </FieldRow>
          <FieldRow label="Join">
            <Segmented<StrokeJoin>
              value={node.strokeJoin ?? 'miter'}
              options={JOIN_OPTIONS}
              onChange={(v) => update(node.id, { strokeJoin: v })}
            />
          </FieldRow>
        </>
      )}
      <button
        type="button"
        onClick={() => flattenBoolean(node.id)}
        disabled={!canFlatten}
        className="w-full rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Flatten to Path
      </button>
    </div>
  )
}

function PathFields({ node }: { node: PathNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <>
          <FieldRow label="Stroke Width">
            <NumberField
              value={node.strokeWidth}
              min={0}
              onCommit={(n) => update(node.id, { strokeWidth: n })}
            />
          </FieldRow>
          <FieldRow label="Cap">
            <Segmented<StrokeCap>
              value={node.strokeCap ?? 'butt'}
              options={CAP_OPTIONS}
              onChange={(v) => update(node.id, { strokeCap: v })}
            />
          </FieldRow>
          <FieldRow label="Join">
            <Segmented<StrokeJoin>
              value={node.strokeJoin ?? 'miter'}
              options={JOIN_OPTIONS}
              onChange={(v) => update(node.id, { strokeJoin: v })}
            />
          </FieldRow>
        </>
      )}
    </div>
  )
}

const BLEND_MODES: BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

const BLEND_LABELS: Record<BlendMode, string> = {
  'source-over': 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'Color Dodge',
  'color-burn': 'Color Burn',
  'hard-light': 'Hard Light',
  'soft-light': 'Soft Light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
}

function CommonFields({ node }: { node: CanvasNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2">
      <FieldRow label="Name">
        <TextField value={node.name} onCommit={(v) => update(node.id, { name: v || node.name })} />
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="X">
          <NumberField value={node.x} onCommit={(n) => update(node.id, { x: n })} />
        </FieldRow>
        <FieldRow label="Y">
          <NumberField value={node.y} onCommit={(n) => update(node.id, { y: n })} />
        </FieldRow>
      </div>
      <FieldRow label="Rotation">
        <NumberField
          value={node.rotation}
          step={1}
          onCommit={(n) => update(node.id, { rotation: n })}
          suffix="°"
        />
      </FieldRow>
      <FieldRow label="Opacity">
        <Slider01 value={node.opacity} onChange={(n) => update(node.id, { opacity: n })} />
      </FieldRow>
      <FieldRow label="Blend">
        <select
          value={node.blendMode ?? 'source-over'}
          onChange={(e) => update(node.id, { blendMode: e.target.value as BlendMode })}
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-600"
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {BLEND_LABELS[m]}
            </option>
          ))}
        </select>
      </FieldRow>
    </div>
  )
}

function RectFields({ node }: { node: RectNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Width">
          <NumberField value={node.width} min={1} onCommit={(n) => update(node.id, { width: n })} />
        </FieldRow>
        <FieldRow label="Height">
          <NumberField value={node.height} min={1} onCommit={(n) => update(node.id, { height: n })} />
        </FieldRow>
      </div>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <>
          <FieldRow label="Stroke Width">
            <NumberField
              value={node.strokeWidth}
              min={0}
              onCommit={(n) => update(node.id, { strokeWidth: n })}
            />
          </FieldRow>
          <FieldRow label="Join">
            <Segmented<StrokeJoin>
              value={node.strokeJoin ?? 'miter'}
              options={JOIN_OPTIONS}
              onChange={(v) => update(node.id, { strokeJoin: v })}
            />
          </FieldRow>
        </>
      )}
      <FieldRow label="Corner Radius">
        <NumberField
          value={node.cornerRadius}
          min={0}
          onCommit={(n) => update(node.id, { cornerRadius: n })}
        />
      </FieldRow>
    </div>
  )
}

function EllipseFields({ node }: { node: EllipseNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Radius X">
          <NumberField value={node.radiusX} min={1} onCommit={(n) => update(node.id, { radiusX: n })} />
        </FieldRow>
        <FieldRow label="Radius Y">
          <NumberField value={node.radiusY} min={1} onCommit={(n) => update(node.id, { radiusY: n })} />
        </FieldRow>
      </div>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
          allowNone
        />
      </FieldRow>
      {node.stroke && (
        <FieldRow label="Stroke Width">
          <NumberField
            value={node.strokeWidth}
            min={0}
            onCommit={(n) => update(node.id, { strokeWidth: n })}
          />
        </FieldRow>
      )}
    </div>
  )
}

function LineFields({ node }: { node: LineNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Stroke">
        <FillEditor
          value={node.stroke}
          onChange={(f) => f && update(node.id, { stroke: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      <FieldRow label="Stroke Width">
        <NumberField
          value={node.strokeWidth}
          min={1}
          onCommit={(n) => update(node.id, { strokeWidth: n })}
        />
      </FieldRow>
      <FieldRow label="Cap">
        <Segmented<StrokeCap>
          value={node.strokeCap ?? 'butt'}
          options={CAP_OPTIONS}
          onChange={(v) => update(node.id, { strokeCap: v })}
        />
      </FieldRow>
      <FieldRow label="Join">
        <Segmented<StrokeJoin>
          value={node.strokeJoin ?? 'miter'}
          options={JOIN_OPTIONS}
          onChange={(v) => update(node.id, { strokeJoin: v })}
        />
      </FieldRow>
    </div>
  )
}

function TextFields({ node }: { node: TextNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Text">
        <TextAreaField value={node.text} onCommit={(v) => update(node.id, { text: v })} />
      </FieldRow>
      <FieldRow label="Font">
        <FontPicker value={node.fontFamily} onChange={(family) => update(node.id, { fontFamily: family })} />
      </FieldRow>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Size">
          <NumberField
            value={node.fontSize}
            min={4}
            onCommit={(n) => update(node.id, { fontSize: n })}
          />
        </FieldRow>
        <FieldRow label="Letter Spacing">
          <NumberField
            value={node.letterSpacing}
            step={0.5}
            onCommit={(n) => update(node.id, { letterSpacing: n })}
          />
        </FieldRow>
      </div>
      <FieldRow label="Style">
        <Segmented<TextNode['fontStyle']>
          value={node.fontStyle}
          options={[
            { value: 'normal', label: 'Regular' },
            { value: 'bold', label: 'Bold' },
            { value: 'italic', label: 'Italic' },
            { value: 'bold italic', label: 'B+I' },
          ]}
          onChange={(v) => update(node.id, { fontStyle: v })}
        />
      </FieldRow>
      <FieldRow label="Align">
        <Segmented<TextNode['align']>
          value={node.align}
          options={[
            { value: 'left', label: 'L' },
            { value: 'center', label: 'C' },
            { value: 'right', label: 'R' },
          ]}
          onChange={(v) => update(node.id, { align: v })}
        />
      </FieldRow>
      <FieldRow label="Width">
        <NumberField value={node.width} min={20} onCommit={(n) => update(node.id, { width: n })} />
      </FieldRow>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
    </div>
  )
}

function IconFields({ node }: { node: IconNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Icon">
        <IconPicker
          value={node.iconName}
          onChange={(name) => update(node.id, { iconName: name })}
        />
      </FieldRow>
      <FieldRow label="Fill">
        <FillEditor
          value={node.fill}
          onChange={(f) => f && update(node.id, { fill: f })}
          bbox={getNodeLocalBbox(node) ?? FILL_BBOX_FALLBACK}
        />
      </FieldRow>
      {node.fill.type !== 'solid' && (
        <div className="rounded border border-neutral-800 bg-neutral-900/50 px-2 py-1.5 text-[10px] text-neutral-500">
          Gradient on icons recolors all paths — multi-color icons collapse
          to a single ramp.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Width">
          <NumberField value={node.width} min={8} onCommit={(n) => update(node.id, { width: n })} />
        </FieldRow>
        <FieldRow label="Height">
          <NumberField value={node.height} min={8} onCommit={(n) => update(node.id, { height: n })} />
        </FieldRow>
      </div>
    </div>
  )
}

function AssetFields({ node }: { node: AssetNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  const replaceNode = useCanvasStore((s) => s.replaceNode)
  const [asset, setAsset] = useState<AssetRecord | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setAsset(null)
    setMissing(false)
    getAsset(node.assetId).then((a) => {
      if (cancelled) return
      if (a) setAsset(a)
      else setMissing(true)
    })
    return () => {
      cancelled = true
    }
  }, [node.assetId])

  const onConvert = async () => {
    if (!asset || asset.kind !== 'svg') return
    setBusy(true)
    setError(null)
    try {
      const text = await asset.blob.text()
      const leaves = svgAssetToPaths(text, node.width, node.height)
      if (!leaves) {
        setError('SVG could not be flattened to a path.')
        setBusy(false)
        return
      }
      // Single-leaf SVGs become one PathNode, sized to the AssetNode's
      // frame so position / rotation transfer cleanly. Multi-leaf SVGs
      // become a Group wrapping one PathNode per source element — the
      // user can grab pieces independently or ungroup to separate them.
      if (leaves.length === 1) {
        const leaf = leaves[0]
        const path: PathNode = {
          id: newId(),
          type: 'path',
          name: asset.name || 'Path',
          locked: node.locked,
          hidden: node.hidden,
          x: node.x,
          y: node.y,
          rotation: node.rotation,
          opacity: node.opacity,
          blendMode: node.blendMode,
          data: leaf.data,
          fill: solidFill(leaf.fill ?? '#0a0a0a'),
          stroke: null,
          strokeWidth: 0,
          width: leaf.width,
          height: leaf.height,
        }
        replaceNode(node.id, path)
      } else {
        const group: GroupNode = {
          id: newId(),
          type: 'group',
          name: asset.name || 'Group',
          locked: node.locked,
          hidden: node.hidden,
          x: node.x,
          y: node.y,
          rotation: node.rotation,
          opacity: node.opacity,
          blendMode: node.blendMode,
          parentId: node.parentId,
          collapsed: false,
        }
        const children: PathNode[] = leaves.map((leaf) => ({
          id: newId(),
          type: 'path',
          name: 'Path',
          locked: false,
          hidden: false,
          x: leaf.x,
          y: leaf.y,
          rotation: 0,
          opacity: 1,
          parentId: group.id,
          data: leaf.data,
          fill: solidFill(leaf.fill ?? '#0a0a0a'),
          stroke: null,
          strokeWidth: 0,
          width: leaf.width,
          height: leaf.height,
        }))
        // Children must precede their group container in the nodes array
        // (canvas-store z-order convention).
        replaceNode(node.id, [...children, group])
      }
    } catch {
      setError('Failed to read SVG asset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span className="truncate">
          {asset ? asset.name : missing ? 'Missing asset' : 'Loading…'}
        </span>
        {asset && (
          <span className="ml-2 shrink-0 uppercase tracking-wider">
            {asset.kind}
          </span>
        )}
      </div>
      {missing && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          Asset is missing. Reimport or delete this layer.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Width">
          <NumberField
            value={node.width}
            min={1}
            onCommit={(n) => update(node.id, { width: n })}
          />
        </FieldRow>
        <FieldRow label="Height">
          <NumberField
            value={node.height}
            min={1}
            onCommit={(n) => update(node.id, { height: n })}
          />
        </FieldRow>
      </div>
      {asset?.kind === 'svg' && (
        <>
          <button
            type="button"
            onClick={onConvert}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded bg-indigo-500 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            <Icon icon="lucide:spline" width={12} height={12} />
            {busy ? 'Converting…' : 'Convert to editable path'}
          </button>
          <div className="rounded border border-neutral-800 bg-neutral-900/50 px-2 py-1.5 text-[10px] text-neutral-500">
            Each path becomes its own editable layer (grouped). Strokes,
            gradients, and effects from the source aren't preserved.
          </div>
        </>
      )}
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}

function LockupRoleField({ node }: { node: GroupNode | BooleanNode }) {
  const update = useCanvasStore((s) => s.updateNode)
  const current = node.lockupRole ?? null
  const set = (next: LockupRole | null) => {
    update(node.id, { lockupRole: next ?? undefined } as Partial<GroupNode>)
  }
  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <FieldRow label="Lockup role">
        <Segmented
          value={current ?? 'none'}
          onChange={(v) => set(v === 'none' ? null : (v as LockupRole))}
          options={[
            { value: 'none', label: 'None' },
            { value: 'icon', label: 'Icon' },
            { value: 'wordmark', label: 'Wordmark' },
          ]}
        />
      </FieldRow>
      <div className="rounded border border-neutral-800 bg-neutral-900/50 px-2 py-1.5 text-[10px] text-neutral-500">
        Tags this {node.type} so the icon-only / wordmark-only export
        variants land on the right shapes.
      </div>
    </div>
  )
}
