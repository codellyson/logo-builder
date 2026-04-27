import { useEffect, useState } from 'react'
import { EditorHeader } from '@/editor/header'
import { LeftSidebar } from '@/editor/left-sidebar'
import { PropertiesPanel } from '@/editor/properties-panel'
import { Toolbar } from '@/editor/toolbar'
import { CompositionToolbar } from '@/editor/composition-toolbar'
import { AlignToolbar } from '@/editor/align-toolbar'
import { useKeyboardShortcuts } from '@/editor/keyboard'
import { EditorCanvas } from '@/canvas/stage'
import { PalettePanel } from '@/colors/palette-panel'
import { ExportModal } from '@/export/export-modal'
import { ProjectsModal } from '@/editor/projects-modal'
import { ShortcutsModal } from '@/editor/shortcuts-modal'
import { ZoomControls } from '@/editor/zoom-controls'
import { EmptyState } from '@/editor/empty-state'
import { useAutosave, restoreActiveProjectOnMount } from '@/state/autosave'
import { useCanvasStore } from '@/state/canvas-store'
import { startBooleanEvalRunner } from '@/composition/boolean-eval-runner'
import { bootCustomFonts } from '@/fonts/custom-fonts'

export function Editor() {
  const [exportOpen, setExportOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [bootReady, setBootReady] = useState(false)
  const hasNodes = useCanvasStore((s) => s.nodes.length > 0)
  useKeyboardShortcuts({ onToggleHelp: () => setHelpOpen((v) => !v) })
  useAutosave()

  // Boot the active project before rendering the editor surface so the
  // canvas mounts onto a fully-restored store. The autosave subscription
  // above only fires on actual changes, so this initial replaceState
  // doesn't trigger a redundant write. Custom fonts are registered in
  // parallel — text layers using them render correctly on first paint.
  useEffect(() => {
    let cancelled = false
    void Promise.all([restoreActiveProjectOnMount(), bootCustomFonts()]).then(() => {
      if (!cancelled) setBootReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => startBooleanEvalRunner(), [])

  if (!bootReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-xs text-neutral-500">
        Loading…
      </div>
    )
  }

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
          <LeftSidebar />
        </aside>
        <main className="relative flex-1 overflow-hidden bg-neutral-900">
          <EditorCanvas />
          <div className="pointer-events-none absolute left-3 top-3">
            <Toolbar />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 gap-2">
            <CompositionToolbar />
            <AlignToolbar />
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
