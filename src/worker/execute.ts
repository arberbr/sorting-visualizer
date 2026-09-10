import { getAlgorithm } from '../algorithms'
import { DEFAULT_LIMITS } from '../core/limits'
import { runSort, type RunResult } from '../core/runner'
import { compileCustom } from './compile'
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
  return runSort(compiled.fn, req.input, limits)
}
