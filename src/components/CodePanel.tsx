import { ALGORITHMS } from '../algorithms'
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
        <button onClick={onRun} disabled={busy}>
          {busy ? 'running…' : 'run ▶'}
        </button>
      </div>
      <CodeMirrorEditor value={source} onChange={onSourceChange} />
    </div>
  )
}

/**
 * Built-ins are TypeScript. Strips the annotations so the source runs as
 * plain JS in the custom-code editor.
 *
 * This is a structural, not a semantic, stripper — it does not parse
 * TypeScript. It targets the two shapes the built-in algorithms actually
 * use:
 *
 *   1. A `(params)` group with no nested parens, immediately followed by an
 *      optional `: ReturnType` and then `=>` or `{` — i.e. an actual
 *      function/arrow signature, wherever it appears (the top-level `sort`,
 *      or a typed closure declared inside it, with any number of params in
 *      any position). Anchoring on that exact shape — not just any
 *      "identifier: word" — is what keeps this out of object literals like
 *      `{ left: null, right: null }`, which use the same syntax but are
 *      never followed by `=>`/`{`.
 *   2. `let`/`const`/`var` declarator annotations (`let root: Node | null
 *      = null`), a generic type argument on a call (`new Array<number>(10)`),
 *      and `as Type` assertions (`stack.pop() as Node`).
 *
 * Verified against the extracted `sort` source of all 31 built-ins: every
 * one compiles as plain JS, and running each against a fake TrackedArray
 * actually sorts. Three (timsort, introsort, shell) still fail at runtime —
 * not because of this function, but because they close over a module-level
 * `const` declared *before* `export function sort`, which
 * `extractSortSource` never includes. Loading one of those three from the
 * dropdown produces code that throws a `ReferenceError` for that constant;
 * fixing it would mean changing `extractSortSource`, which is out of scope
 * here and has its own contract test.
 */
export function toPlainJs(source: string): string {
  let out = source.replace(
    /\(([^()]*)\)(?:\s*:\s*[^{=]+?)?(\s*(?:=>|\{))/g,
    (_match, params: string, tail: string) =>
      `(${params.replace(/([A-Za-z_$][\w$]*)\s*:\s*[^,]+/g, '$1')})${tail}`,
  )
  // Generic type arguments on a call, e.g. `new Array<number>(10)`.
  out = out.replace(/\b([A-Za-z_$][\w$]*)<[^<>()]+>(?=\()/g, '$1')
  // `as Type` assertions, e.g. `stack.pop() as Node`.
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*/g, '')
  // `let`/`const`/`var` declarator annotations: `let root: Node | null = null`.
  out = out.replace(/\b(let|const|var)(\s+[A-Za-z_$][\w$]*)\s*:\s*[^=;]+?(?=\s*=)/g, '$1$2')
  return out
}
