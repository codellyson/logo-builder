import { useEffect, useState } from 'react'
import { EditorHeader } from '@/editor/header'
import { LayersPanel } from '@/editor/layers-panel'
import { PropertiesPanel } from '@/editor/properties-panel'
import { Toolbar } from '@/editor/toolbar'
import { CompositionToolbar } from '@/editor/composition-toolbar'
import { useKeyboardShortcuts } from '@/editor/keyboard'
import { EditorCanvas } from '@/canvas/stage'
import { PalettePanel } from '@/colors/palette-panel'
import { ExportModal } from '@/export/export-modal'
import { ProjectsModal } from '@/editor/projects-modal'
import { ShortcutsModal } from '@/editor/shortcuts-modal'
import { ZoomControls } from '@/editor/zoom-controls'
import { EmptyState } from '@/editor/empty-state'
import { useAutosave, restoreSnapshotOnMount } from '@/state/autosave'
import { useCanvasStore } from '@/state/canvas-store'
import { startBooleanEvalRunner } from '@/composition/boolean-eval-runner'

export function Editor() {
  const [exportOpen, setExportOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const hasNodes = useCanvasStore((s) => s.nodes.length > 0)
  useKeyboardShortcuts({ onToggleHelp: () => setHelpOpen((v) => !v) })
  useAutosave()

  useEffect(() => {
    restoreSnapshotOnMount()
  }, [])

  useEffect(() => startBooleanEvalRunner(), [])

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      <EditorHeader
        onOpenExport={() => setExportOpen(true)}
        onOpenProjects={() => setProjectsOpen(true)}
        canExport={hasNodes}
      />
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {projectsOpen && <ProjectsModal onClose={() => setProjectsOpen(false)} />}
      {helpOpen && <ShortcutsModal onClose={() => setHelpOpen(false)} />}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-950">
          <LayersPanel />
        </aside>
        <main className="relative flex-1 overflow-hidden bg-neutral-900">
          <EditorCanvas />
          <div className="pointer-events-none absolute left-3 top-3">
            <Toolbar />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
            <CompositionToolbar />
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3">
            <ZoomControls />
          </div>
          {!hasNodes && <EmptyState />}
        </main>
        <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel />
          </div>
          <PalettePanel />
        </aside>
      </div>
    </div>
  )
}
