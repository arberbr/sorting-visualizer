import type { RunError } from '../core/runner'

const EXPLANATIONS: Record<RunError['code'], string> = {
  syntax: 'Your code could not be parsed.',
  runtime: 'Your code threw while running.',
  timeout: 'Your code ran past the time limit without finishing.',
  'step-budget':
    'Your code did too many array operations — this is almost always an infinite loop.',
  'not-a-function': 'No sort function was found.',
}

interface Props {
  error: RunError | null
  onDismiss: () => void
}

export default function ErrorBanner({ error, onDismiss }: Props) {
  if (!error) return null
  return (
    <div className="banner" role="alert">
      <div className="banner__body">
        <span className="banner__code label">{error.code}</span>
        <span>{EXPLANATIONS[error.code]}</span>
        <span className="banner__detail mono">
          {error.line !== undefined ? `line ${error.line}: ` : ''}
          {error.message}
        </span>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  )
}
