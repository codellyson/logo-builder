import { Icon } from '@iconify/react'

type Props = {
  onEnter: () => void
}

// Minimal hero — the wordmark, the tagline, one CTA. Mirrors the
// Geometric Wordmark template's composition (mauve dot above bold
// wordmark) so the landing reads as a logo built in the tool itself.
export function Landing({ onEnter }: Props) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#FAF8F5] text-neutral-900">
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-8 h-12 w-12 rounded-full"
            style={{ backgroundColor: '#A35E78' }}
            aria-hidden
          />
          <h1
            className="text-7xl font-bold leading-none tracking-tight sm:text-8xl"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            Builty
          </h1>
          <p className="mt-6 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Make your mark
          </p>
          <p className="mt-10 max-w-md text-base leading-relaxed text-neutral-600">
            A free logo builder for indie makers and designers.
            Runs in your browser. No signup. No AI slop.
          </p>
          <button
            type="button"
            onClick={onEnter}
            className="mt-10 inline-flex items-center gap-2 rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            Try the builder
            <Icon icon="lucide:arrow-right" width={14} height={14} />
          </button>
        </div>
      </main>
      <footer className="px-6 py-6 text-center text-[11px] text-neutral-500">
        Part of{' '}
        <a
          href="https://kreativekorna.com"
          className="underline-offset-2 hover:text-neutral-700 hover:underline"
        >
          Kreative Korna
        </a>
      </footer>
    </div>
  )
}
