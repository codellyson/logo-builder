import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Manual chunks split heavy deps that ride together cohesively. Goal:
// keep the initial bundle small, let user-triggered features pull in
// their own chunks on demand. Vite/Rolldown invokes manualChunks per
// resolved module id; we route node_modules bins by package name.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Lazy chunks (paper, export-deps) intentionally exceed the default
    // 500 kB warn threshold — they're loaded on demand, not on first
    // paint. Bump the limit so the warning isn't misleading.
    chunkSizeWarningLimit: 800,
    // Don't preload chunks that are ONLY reachable through dynamic
    // imports — they shouldn't compete for bandwidth on first paint and
    // get fetched on demand when their import() fires.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (d) =>
            !/\/(paper|export-deps|opentype|export-modal|projects-modal|shortcuts-modal)-/.test(
              d,
            ),
        ),
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // src-level: paper-bridge (and the modules that use it) are
          // pinned to the same chunk as paper.js so they all load
          // together when any paper-using feature is first invoked.
          // Without this, Rolldown hoists paper-bridge into the eager
          // index chunk because it's shared across multiple dynamic
          // consumers, which drags paper.js into the static graph.
          if (
            id.includes('/composition/paper-bridge') ||
            id.includes('/composition/path-edit-ops') ||
            id.includes('/composition/svg-asset-to-path') ||
            id.includes('/composition/node-to-path') ||
            id.includes('/composition/stroke-outline') ||
            id.includes('/composition/pen-path-builder') ||
            id.includes('/composition/evaluate-boolean') ||
            id.includes('/composition/convert-to-path') ||
            id.includes('/composition/boolean-eval-runner')
          ) {
            return 'paper'
          }
          if (!id.includes('node_modules')) return undefined
          // paper.js + paperjs-offset are co-located: pen tool, boolean
          // ops, stroke outlining, SVG-asset conversion all use both.
          if (id.includes('node_modules/paper') || id.includes('paperjs-offset')) {
            return 'paper'
          }
          // opentype.js: text-to-outlines (export) and font-asset family
          // parsing (font upload). Both user-triggered.
          if (id.includes('opentype.js')) return 'opentype'
          // Export-only deps: jszip + svgo. Pulled on first export click
          // once the modal is dynamically imported.
          if (id.includes('jszip') || id.includes('svgo')) return 'export-deps'
          // Konva is the canvas runtime — needed on every render, but
          // splitting it lets browsers cache it separately from app code.
          if (id.includes('konva')) return 'konva'
          // React / ReactDOM
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
