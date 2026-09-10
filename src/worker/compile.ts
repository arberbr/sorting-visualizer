import type { RunError } from '../core/runner'
import type { SortFn } from '../core/types'

const ANONYMOUS_FRAME = /<anonymous>:(\d+):\d+/

/**
 * `new Function(body)` does not compile `body` verbatim — every engine we've
 * checked synthesizes a wrapper around it (on V8: `function anonymous(\n) {\n`)
 * before the body even starts, so a line reported for the compiled function
 * is offset from the line the user actually typed. Measured once against
 * whatever engine is actually running, rather than hard-coded, so this stays
 * correct even if a wrapper's shape differs across engines or changes.
 */
function probeWrapperLineOffset(): number {
  try {
    const probe = new Function('throw new Error("probe")') as () => void
    probe()
  } catch (e) {
    const m = ANONYMOUS_FRAME.exec((e as Error)?.stack ?? '')
    if (m) return Number(m[1]) - 1
  }
  return 0
}

/** Lines the Function constructor's synthetic wrapper adds before user code. */
export const WRAPPER_LINE_OFFSET = probeWrapperLineOffset()

/** Best-effort line for a compile-time error, corrected for the wrapper offset. */
function wrapperCorrectedLine(err: Error): number | undefined {
  const m = ANONYMOUS_FRAME.exec(err?.stack ?? '')
  if (!m) return undefined
  return Math.max(1, Number(m[1]) - WRAPPER_LINE_OFFSET)
}

/**
 * Turns user source into a callable sort function.
 *
 * The prologue is kept on the user's own first line so it never adds an
 * extra line of its own — but the Function constructor's synthetic wrapper
 * still offsets every reported line by `WRAPPER_LINE_OFFSET`. A syntax error
 * caught here is corrected on a best-effort basis (V8 doesn't always expose a
 * position for one); a runtime error from actually *running* the compiled
 * function is corrected by the caller in the worker's execute(), since that's
 * the only place a "custom" run is distinguished from a "builtin" one.
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
    return {
      ok: false,
      error: { code: 'syntax', message: err.message, line: wrapperCorrectedLine(err) },
    }
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
