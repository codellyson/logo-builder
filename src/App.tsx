import { lazy, Suspense, useEffect, useState } from 'react'
import { Landing } from '@/landing/landing'
import { ErrorBoundary } from '@/ui/error-boundary'

// Lazy: the editor pulls Konva, paper, drag-drop logic, and a deep tree
// of canvas state. Visitors landing on `/` should never pay that cost
// just to read the marketing hero — we only fetch the editor chunk
// when the user navigates into /app.
const Editor = lazy(() => import('@/editor/editor').then((m) => ({ default: m.Editor })))

const APP_PATH = '/app'

function isAppPath(path: string): boolean {
  return path === APP_PATH || path.startsWith(`${APP_PATH}/`)
}

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to: string) => {
    if (window.location.pathname === to) return
    window.history.pushState({}, '', to)
    setPath(to)
  }

  if (isAppPath(path)) {
    return (
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-xs text-neutral-500">
              Loading…
            </div>
          }
        >
          <Editor />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return <Landing onEnter={() => navigate(APP_PATH)} />
}
