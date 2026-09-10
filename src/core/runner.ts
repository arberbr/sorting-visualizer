import { buildKeyframes } from './keyframes'
import { Budget, DEFAULT_LIMITS, LimitError, type Limits } from './limits'
import { TrackedArray } from './trackedArray'
import { checkSorted } from './verify'
import type { Counts, SortFn, Step } from './types'

export interface Keyframe {
  index: number
  main: Float64Array
  aux: Float64Array | null
  counts: Counts
  sorted: Uint8Array
  /** -1 when no pivot was marked as of this keyframe. */
  pivot: number
  range: [number, number] | null
  lastCompare: Int32Array
  lastWrite: Int32Array
}

export interface Trace {
  input: number[]
  steps: Step[]
  auxLength: number
  counts: Counts
  keyframes: Keyframe[]
}

export interface RunError {
  code: 'syntax' | 'runtime' | 'timeout' | 'step-budget' | 'not-a-function'
  message: string
  line?: number
  limit?: number
}

export type RunResult =
  | { ok: true; trace: Trace; finalArray: number[]; sorted: boolean; firstUnsorted: number }
  | { ok: false; error: RunError }

/**
 * Runs a sorting function against an instrumented copy of `input`.
 * Never throws: every failure mode comes back as a structured RunError.
 */
export function runSort(
  sortFn: SortFn,
  input: readonly number[],
  limits: Limits = DEFAULT_LIMITS,
): RunResult {
  if (typeof sortFn !== 'function') {
    return {
      ok: false,
      error: { code: 'not-a-function', message: 'No sort function was provided' },
    }
  }

  const arr = new TrackedArray(input, new Budget(limits))

  try {
    const result: unknown = sortFn(arr)
    if (isThenable(result)) {
      // A later rejection has nowhere left to go once we've already returned
      // a RunError below — attach a no-op handler so it can't surface as an
      // unhandled rejection outside runSort's control.
      result.then(
        () => {},
        () => {},
      )
      return {
        ok: false,
        error: {
          code: 'runtime',
          message:
            'sort() must be synchronous — it returned a Promise. Remove async/await; every operation is recorded as it happens.',
        },
      }
    }
  } catch (e) {
    if (e instanceof LimitError) {
      return { ok: false, error: { code: e.kind, message: e.message, limit: e.limit } }
    }
    return {
      ok: false,
      error: {
        code: 'runtime',
        message: messageOf(e),
        line: e instanceof Error ? lineOf(e) : undefined,
      },
    }
  }

  const finalArray = arr.snapshot()
  const { sorted, firstUnsorted } = checkSorted(finalArray)

  return {
    ok: true,
    trace: {
      input: Array.from(input),
      steps: arr.steps,
      auxLength: arr.auxLength,
      counts: arr.counts,
      keyframes: buildKeyframes(input, arr.steps, arr.auxLength),
    },
    finalArray,
    sorted,
    firstUnsorted,
  }
}

/** Best-effort line number from a stack frame in dynamically compiled user code. */
function lineOf(err: Error): number | undefined {
  const m = /<anonymous>:(\d+):\d+/.exec(err?.stack ?? '')
  return m ? Number(m[1]) : undefined
}

/** True for anything with a callable `.then`, i.e. a Promise or Promise-like. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** A readable, always-non-empty message for a value thrown by user code. */
function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e) ?? String(e)
  } catch {
    return String(e)
  }
}
