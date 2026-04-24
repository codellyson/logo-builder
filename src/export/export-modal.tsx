import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useCanvasStore } from '@/state/canvas-store'
import { buildBrandPack } from '@/export/pipeline'

type Props = {
  onClose: () => void
}

export function ExportModal({ onClose }: Props) {
  const nodes = useCanvasStore((s) => s.nodes)
  const stageWidth = useCanvasStore((s) => s.stageWidth)
  const stageHeight = useCanvasStore((s) => s.stageHeight)
  const artboardBackground = useCanvasStore((s) => s.artboardBackground)
  const [brandName, setBrandName] = useState('logo')
  const [status, setStatus] = useState<'idle' | 'building' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setStatus('building')
    setError(null)
    try {
      const blob = await buildBrandPack({
        nodes,
        stageWidth,
        stageHeight,
        brandName,
        artboardBackground,
      })
      const slug = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slug}-brand-pack.zip`
      a.click()
      URL.revokeObjectURL(url)
      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Export brand pack</div>
            <div className="text-xs text-neutral-500">
              SVG + PNG + favicon, as a single ZIP.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
              Brand slug
            </div>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
            <div className="mt-1 text-[10px] text-neutral-600">
              Used for filenames in the ZIP.
            </div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-[11px] text-neutral-400">
            <div className="mb-1 font-medium text-neutral-300">Pack contents</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>SVG: original, icon-only, wordmark-only, mono-black, mono-white</li>
              <li>PNG: each variant at 512, 1024, 2048 px</li>
              <li>Favicon: .ico + PNG at 16/32/48/180/192/512</li>
            </ul>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button
            type="button"
            onClick={run}
            disabled={status === 'building'}
            className="w-full rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === 'building' ? 'Building…' : status === 'done' ? 'Exported — export again?' : 'Export ZIP'}
          </button>
        </div>
      </div>
    </div>
  )
}
