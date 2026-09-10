import type { RunError } from '../core/runner'
import type { SortFn } from '../core/types'

/**
 * Turns user source into a callable sort function.
 * The prologue is kept on line 1 so reported line numbers match what the user typed.
 */
export function compileCustom(
  source: string,
): { ok: true; fn: SortFn } | { ok: false; error: RunError } {
  let factory: () => unknown
  try {
    factory = new Function(
      `"use strict";${source}\n;return typeof sort === 'function' ? sort : undefined;`,
    ) as () => unknown
  } catch (e) {
    const err = e as Error
    return { ok: false, error: { code: 'syntax', message: err.message } }
  }

  let candidate: unknown
  try {
    candidate = factory()
  } catch (e) {
    const err = e as Error
    return { ok: false, error: { code: 'runtime', message: err.message } }
  }

  if (typeof candidate !== 'function') {
    return {
      ok: false,
      error: {
        code: 'not-a-function',
        message: 'Your code must define a function called sort(arr)',
      },
    }
  }

  return { ok: true, fn: candidate as SortFn }
}
