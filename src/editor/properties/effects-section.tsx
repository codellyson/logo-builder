import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Popover } from '@/ui/popover'
import { useCanvasStore } from '@/state/canvas-store'
import type {
  BlurEffect,
  CanvasNode,
  DropShadowEffect,
  Effect,
  EffectType,
  OuterGlowEffect,
} from '@/canvas/types'
import { ColorPicker } from '@/colors/color-picker'
import { FieldRow, NumberField, Slider01 } from '@/ui/fields'
import { cn } from '@/lib/cn'

const EFFECT_LABELS: Record<EffectType, string> = {
  'drop-shadow': 'Drop Shadow',
  'outer-glow': 'Outer Glow',
  blur: 'Blur',
}

const EFFECT_ICONS: Record<EffectType, string> = {
  'drop-shadow': 'lucide:square-stack',
  'outer-glow': 'lucide:sparkles',
  blur: 'lucide:droplet',
}

const ADD_OPTIONS: EffectType[] = ['drop-shadow', 'outer-glow', 'blur']

function countShadowLike(effects: Effect[]): number {
  let count = 0
  for (const e of effects) {
    if (e.enabled && (e.type === 'drop-shadow' || e.type === 'outer-glow')) count++
  }
  return count
}

function makeEffect(type: EffectType): Effect {
  if (type === 'drop-shadow') {
    return {
      type: 'drop-shadow',
      enabled: true,
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      color: '#000000',
      opacity: 0.25,
    }
  }
  if (type === 'outer-glow') {
    return {
      type: 'outer-glow',
      enabled: true,
      blur: 12,
      color: '#6366f1',
      opacity: 0.5,
    }
  }
  return { type: 'blur', enabled: true, radius: 4 }
}

export function EffectsSection({ node }: { node: CanvasNode }) {
  const addEffect = useCanvasStore((s) => s.addEffect)
  const removeEffect = useCanvasStore((s) => s.removeEffect)
  const updateEffect = useCanvasStore((s) => s.updateEffect)
  const [open, setOpen] = useState(true)
  const effects = node.effects ?? []

  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
      >
        <span>Effects</span>
        <Icon
          icon={open ? 'lucide:chevron-down' : 'lucide:chevron-right'}
          width={11}
          height={11}
        />
      </button>
      {open && (
        <div className="space-y-1.5">
          {countShadowLike(effects) > 1 && (
            <div className="rounded border border-neutral-800 bg-neutral-900/50 px-2 py-1.5 text-[10px] text-neutral-500">
              Canvas previews the topmost shadow / glow only. SVG export
              composes all enabled effects.
            </div>
          )}
          {effects.map((eff, i) => (
            <EffectRow
              key={i}
              effect={eff}
              onToggle={() =>
                updateEffect(node.id, i, { enabled: !eff.enabled } as Partial<Effect>)
              }
              onPatch={(patch) => updateEffect(node.id, i, patch)}
              onRemove={() => removeEffect(node.id, i)}
            />
          ))}
          <Popover
            align="start"
            trigger={
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-neutral-800 px-2 py-1 text-[11px] text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
              >
                <Icon icon="lucide:plus" width={11} height={11} />
                Add effect
              </button>
            }
            className="w-44"
          >
            {({ close }) => (
              <div className="p-1">
                {ADD_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      addEffect(node.id, makeEffect(type))
                      close()
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  >
                    <Icon icon={EFFECT_ICONS[type]} width={12} height={12} />
                    {EFFECT_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </div>
      )}
    </div>
  )
}

function EffectRow({
  effect,
  onToggle,
  onPatch,
  onRemove,
}: {
  effect: Effect
  onToggle: () => void
  onPatch: (patch: Partial<Effect>) => void
  onRemove: () => void
}) {
  return (
    <div
      className={cn(
        'rounded border border-neutral-800 bg-neutral-900/40',
        !effect.enabled && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          title={effect.enabled ? 'Disable' : 'Enable'}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
        >
          <Icon
            icon={effect.enabled ? 'lucide:eye' : 'lucide:eye-off'}
            width={11}
            height={11}
          />
        </button>
        <Icon icon={EFFECT_ICONS[effect.type]} width={12} height={12} className="text-neutral-500" />
        <span className="flex-1 truncate text-[11px] text-neutral-300">
          {EFFECT_LABELS[effect.type]}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-red-400"
        >
          <Icon icon="lucide:trash-2" width={11} height={11} />
        </button>
      </div>
      {effect.type === 'drop-shadow' && (
        <DropShadowEditor effect={effect} onPatch={onPatch} />
      )}
      {effect.type === 'outer-glow' && (
        <OuterGlowEditor effect={effect} onPatch={onPatch} />
      )}
      {effect.type === 'blur' && (
        <BlurEditor effect={effect} onPatch={onPatch} />
      )}
    </div>
  )
}

function BlurEditor({
  effect,
  onPatch,
}: {
  effect: BlurEffect
  onPatch: (patch: Partial<BlurEffect>) => void
}) {
  return (
    <div className="space-y-2 border-t border-neutral-800 px-2 py-2">
      <FieldRow label="Radius">
        <NumberField
          value={effect.radius}
          min={0}
          max={40}
          onCommit={(n) => onPatch({ radius: Math.max(0, Math.min(40, n)) })}
        />
      </FieldRow>
    </div>
  )
}

function OuterGlowEditor({
  effect,
  onPatch,
}: {
  effect: OuterGlowEffect
  onPatch: (patch: Partial<OuterGlowEffect>) => void
}) {
  return (
    <div className="space-y-2 border-t border-neutral-800 px-2 py-2">
      <FieldRow label="Blur">
        <NumberField
          value={effect.blur}
          min={0}
          max={100}
          onCommit={(n) => onPatch({ blur: Math.max(0, n) })}
        />
      </FieldRow>
      <FieldRow label="Color">
        <ColorPicker
          value={effect.color}
          onChange={(hex) => {
            if (hex) onPatch({ color: hex })
          }}
        />
      </FieldRow>
      <FieldRow label="Opacity">
        <Slider01
          value={effect.opacity}
          onChange={(v) => onPatch({ opacity: v })}
        />
      </FieldRow>
    </div>
  )
}

function DropShadowEditor({
  effect,
  onPatch,
}: {
  effect: DropShadowEffect
  onPatch: (patch: Partial<DropShadowEffect>) => void
}) {
  return (
    <div className="space-y-2 border-t border-neutral-800 px-2 py-2">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Offset X">
          <NumberField
            value={effect.offsetX}
            onCommit={(n) => onPatch({ offsetX: n })}
          />
        </FieldRow>
        <FieldRow label="Offset Y">
          <NumberField
            value={effect.offsetY}
            onCommit={(n) => onPatch({ offsetY: n })}
          />
        </FieldRow>
      </div>
      <FieldRow label="Blur">
        <NumberField
          value={effect.blur}
          min={0}
          max={100}
          onCommit={(n) => onPatch({ blur: Math.max(0, n) })}
        />
      </FieldRow>
      <FieldRow label="Color">
        <ColorPicker
          value={effect.color}
          onChange={(hex) => {
            if (hex) onPatch({ color: hex })
          }}
        />
      </FieldRow>
      <FieldRow label="Opacity">
        <Slider01
          value={effect.opacity}
          onChange={(v) => onPatch({ opacity: v })}
        />
      </FieldRow>
    </div>
  )
}
