import { getAlgorithm } from '../algorithms'
import { DEFAULT_LIMITS } from '../core/limits'
import { runSort, type RunResult } from '../core/runner'
import { compileCustom, WRAPPER_LINE_OFFSET } from './compile'
import type { RunRequest } from './protocol'

/** The one place a sort is actually executed. Never throws. */
export function execute(req: RunRequest): RunResult {
  const limits = req.limits ?? DEFAULT_LIMITS

  if (req.kind === 'builtin') {
    const algo = getAlgorithm(req.algorithmId)
    if (!algo) {
      return {
        ok: false,
        error: { code: 'not-a-function', message: `Unknown algorithm: ${req.algorithmId}` },
      }
    }
    return runSort(algo.sort, req.input, limits)
  }

  const compiled = compileCustom(req.source)
  if (!compiled.ok) return { ok: false, error: compiled.error }
  return correctForWrapperOffset(runSort(compiled.fn, req.input, limits))
}

/**
 * `runSort` (in core/, which knows nothing about `new Function`) reports the
 * raw line pulled from a dynamically compiled function's stack trace. Only
 * the worker layer knows that line is offset by the Function constructor's
 * synthetic wrapper, so the correction happens here — for custom runs only,
 * and only when a line was actually reported.
 */
function correctForWrapperOffset(result: RunResult): RunResult {
  if (result.ok || result.error.line === undefined) return result
  return {
    ...result,
    error: { ...result.error, line: Math.max(1, result.error.line - WRAPPER_LINE_OFFSET) },
  }
}
