import { Editor } from '@/editor/editor'
import { ErrorBoundary } from '@/ui/error-boundary'

export default function App() {
  return (
    <ErrorBoundary>
      <Editor />
    </ErrorBoundary>
  )
}
