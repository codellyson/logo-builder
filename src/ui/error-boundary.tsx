import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Editor crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-neutral-100">
        <div className="text-lg font-medium">Something broke.</div>
        <div className="max-w-lg rounded bg-neutral-900 p-3 font-mono text-xs text-red-300">
          {this.state.error.message}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('logo-builder:autosave:v1')
              location.reload()
            }}
            className="rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          >
            Reset canvas + reload
          </button>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
