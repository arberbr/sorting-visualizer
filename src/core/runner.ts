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
    sortFn(arr)
  } catch (e) {
    if (e instanceof LimitError) {
      return { ok: false, error: { code: e.kind, message: e.message, limit: e.limit } }
    }
    const err = e as Error
    return {
      ok: false,
      error: { code: 'runtime', message: err?.message ?? String(e), line: lineOf(err) },
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
      keyframes: [],
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
