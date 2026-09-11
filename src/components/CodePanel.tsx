import { ALGORITHMS } from '../algorithms'
import { toPlainJs } from '../algorithms/toPlainJs'
import type { RunError } from '../core/runner'
import CodeMirrorEditor from './CodeMirrorEditor'

interface Props {
  source: string
  busy: boolean
  error: RunError | null
  onSourceChange: (source: string) => void
  onRun: () => void
}

export default function CodePanel({ source, busy, error, onSourceChange, onRun }: Props) {
  return (
    <div className="codepanel">
      <div className="codepanel__bar">
        <span className="label">your code</span>
        <select
          aria-label="Start from a built-in"
          value=""
          onChange={(e) => {
            const algo = ALGORITHMS.find((a) => a.meta.id === e.target.value)
            if (algo) onSourceChange(toPlainJs(algo.source))
          }}
        >
          <option value="">start from a built-in…</option>
          {ALGORITHMS.map((a) => (
            <option key={a.meta.id} value={a.meta.id}>
              {a.meta.name}
            </option>
          ))}
        </select>
        {error && (
          <span className="codepanel__error mono" data-testid="codepanel-error">
            {error.line !== undefined ? `line ${error.line}: ` : ''}
            {error.message}
          </span>
        )}
        <button type="button" onClick={onRun} disabled={busy}>
          {busy ? 'running…' : 'run ▶'}
        </button>
      </div>
      <CodeMirrorEditor value={source} onChange={onSourceChange} />
    </div>
  )
}
