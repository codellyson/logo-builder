import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

type Props = {
  onClose: () => void
}

export function TemplateExportDialog({ onClose }: Props) {
  const [literal, setLiteral] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void import('@/templates/debug-export').then((m) => {
      setLiteral(m.buildTemplateLiteral())
    })
  }, [])

  const onCopy = async () => {
    if (!literal) return
    try {
      await navigator.clipboard.writeText(literal)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for non-secure contexts: select the textarea text.
      const ta = document.getElementById('template-literal-textarea') as HTMLTextAreaElement | null
      if (ta) {
        ta.select()
        document.execCommand('copy')
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium">Export as template</div>
            <div className="text-xs text-ink-4">
              Paste into <code className="text-ink-3">TEMPLATES</code> in{' '}
              <code className="text-ink-3">src/templates/registry.ts</code>.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="rounded border border-line bg-surface-2/50 px-3 py-2 text-[11px] text-ink-3">
            Tip: any TextNode with the literal word{' '}
            <code className="text-ink-2">Brand</code> is rewritten to{' '}
            <code className="text-ink-2">{'{{brand}}'}</code> so the
            instantiator can swap in the user's brand name.
          </div>
          <textarea
            id="template-literal-textarea"
            readOnly
            value={literal || 'Building…'}
            spellCheck={false}
            className="flex-1 resize-none rounded border border-line bg-surface-2 p-2 font-mono text-[11px] text-ink outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCopy}
              disabled={!literal}
              className="flex items-center gap-1 rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
            >
              <Icon icon="lucide:clipboard" width={12} height={12} />
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
