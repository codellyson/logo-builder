import { useState } from 'react'
import { LayersPanel } from '@/editor/layers-panel'
import { AssetsPanel } from '@/editor/assets-panel'
import { cn } from '@/lib/cn'

type Tab = 'layers' | 'assets'

export function LeftSidebar() {
  const [tab, setTab] = useState<Tab>('layers')
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-line">
        <TabButton active={tab === 'layers'} onClick={() => setTab('layers')}>
          Layers
        </TabButton>
        <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>
          Assets
        </TabButton>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'layers' ? <LayersPanel /> : <AssetsPanel />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors',
        active
          ? 'border-b-2 border-indigo-400 text-ink'
          : 'border-b-2 border-transparent text-ink-4 hover:text-ink-2',
      )}
    >
      {children}
    </button>
  )
}
