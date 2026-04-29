import { lazy, Suspense, useEffect, useState } from 'react'
import { EditorHeader } from '@/editor/header'
import { LeftSidebar } from '@/editor/left-sidebar'
import { PropertiesPanel } from '@/editor/properties-panel'
import { Toolbar } from '@/editor/toolbar'
import { CompositionToolbar } from '@/editor/composition-toolbar'
import { AlignToolbar } from '@/editor/align-toolbar'
import { useKeyboardShortcuts } from '@/editor/keyboard'
import { EditorCanvas } from '@/canvas/stage'
import { PalettePanel } from '@/colors/palette-panel'
import { ZoomControls } from '@/editor/zoom-controls'
import { CropModeToolbar } from '@/editor/crop-mode-toolbar'
import { EmptyState } from '@/editor/empty-state'
import { useAutosave, restoreActiveProjectOnMount } from '@/state/autosave'
import { useCanvasStore } from '@/state/canvas-store'
import { bootCustomFonts } from '@/fonts/custom-fonts'
import { DraggablePanel } from '@/editor/draggable-panel'

// Modal-only components are lazy so their static-import deps (jszip,
// svgo for ExportModal; serializeSvg → opentype for ProjectsModal
// thumbnails) don't ride along on the initial bundle.
const ExportModal = lazy(() =>
  import('@/export/export-modal').then((m) => ({ default: m.ExportModal })),
)
const ProjectsModal = lazy(() =>
  import('@/editor/projects-modal').then((m) => ({ default: m.ProjectsModal })),
)
const ShortcutsModal = lazy(() =>
  import('@/editor/shortcuts-modal').then((m) => ({ default: m.ShortcutsModal })),
)
const TemplatesModal = lazy(() =>
  import('@/editor/templates-modal').then((m) => ({ default: m.TemplatesModal })),
)

export function Editor() {
  const [exportOpen, setExportOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
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

  // Lazy-import the boolean eval runner so its static paper.js graph
  // (node-to-path, stroke-outline, evaluate-boolean) doesn't ride along
  // on the initial bundle. The runner only does work when there's a
  // boolean to evaluate, so deferring its module load is free in
  // practice.
  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void import('@/composition/boolean-eval-runner').then((m) => {
      if (cancelled) return
      stop = m.startBooleanEvalRunner()
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  if (!bootReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface text-xs text-ink-4">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-surface text-ink">
      <EditorHeader
        onOpenExport={() => setExportOpen(true)}
        onOpenProjects={() => setProjectsOpen(true)}
        canExport={hasNodes}
      />
      <Suspense fallback={null}>
        {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
        {projectsOpen && (
          <ProjectsModal
            onClose={() => setProjectsOpen(false)}
            onPickTemplate={() => {
              setProjectsOpen(false)
              setTemplatesOpen(true)
            }}
          />
        )}
        {helpOpen && <ShortcutsModal onClose={() => setHelpOpen(false)} />}
        {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
      </Suspense>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-line bg-surface">
          <LeftSidebar />
        </aside>
        <main className="relative flex-1 overflow-hidden bg-surface-2">
          <EditorCanvas />
          <DraggablePanel name="toolbar" defaultStyle={{ position: 'absolute', left: 12, top: 12 }}>
            <Toolbar />
          </DraggablePanel>
          <DraggablePanel
            name="composition"
            defaultStyle={{
              position: 'absolute',
              left: '50%',
              top: 12,
              transform: 'translateX(-50%)',
            }}
            className="flex gap-2"
          >
            <CompositionToolbar />
            <AlignToolbar />
          </DraggablePanel>
          <DraggablePanel name="zoom" defaultStyle={{ position: 'absolute', right: 12, bottom: 12 }}>
            <ZoomControls />
          </DraggablePanel>
          <div
            className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2"
          >
            <CropModeToolbar />
          </div>
          {!hasNodes && <EmptyState />}
        </main>
        <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel />
          </div>
          <PalettePanel />
        </aside>
      </div>
    </div>
  )
}
