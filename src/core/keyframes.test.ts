import { describe, expect, it } from 'vitest'
import { applyStep, createInitialState, type FrameState } from './frame'
import { buildKeyframes, stateAt } from './keyframes'
import { runSort } from './runner'
import type { TrackedArray } from './trackedArray'

const bubble = (a: TrackedArray) => {
  for (let end = a.length - 1; end > 0; end--) {
    for (let i = 0; i < end; i++) if (a.compare(i, i + 1) > 0) a.swap(i, i + 1)
    a.markSorted(end)
  }
}

const traceOf = (n: number) => {
  const input = Array.from({ length: n }, (_, i) => (i * 7919) % n)
  const r = runSort(bubble, input)
  if (!r.ok) throw new Error('run failed')
  return r.trace
}

/** Independent reference implementation: replay from step 0 every time. */
const linearStateAt = (trace: ReturnType<typeof traceOf>, index: number) => {
  const s = createInitialState(trace.input, trace.auxLength)
  for (let i = 0; i < index; i++) applyStep(s, trace.steps[i])
  return s
}

describe('buildKeyframes', () => {
  it('always includes step 0 and spaces the rest by the interval', () => {
    const trace = traceOf(80)
    const kf = buildKeyframes(trace.input, trace.steps, trace.auxLength, 100)
    expect(kf[0].index).toBe(0)
    expect(kf[1].index).toBe(100)
    expect(kf.at(-1)!.index).toBeLessThanOrEqual(trace.steps.length)
  })
})

describe('stateAt', () => {
  it('matches a linear replay at arbitrary indices', () => {
    const trace = traceOf(60)
    const picks = [0, 1, 7, 999, 2001, Math.floor(trace.steps.length / 2), trace.steps.length]
    for (const index of picks) {
      const i = Math.min(index, trace.steps.length)
      const fast = stateAt(trace, i)
      const slow = linearStateAt(trace, i)
      expect(Array.from(fast.main)).toEqual(Array.from(slow.main))
      expect(Array.from(fast.sorted)).toEqual(Array.from(slow.sorted))
      expect(fast.counts).toEqual(slow.counts)
      expect(fast.index).toBe(i)
    }
  })

  it('gives the same answer seeking backwards as forwards', () => {
    const trace = traceOf(40)
    const mid = Math.floor(trace.steps.length / 2)
    const forward = stateAt(trace, mid)
    stateAt(trace, trace.steps.length)
    const backward = stateAt(trace, mid)
    expect(Array.from(backward.main)).toEqual(Array.from(forward.main))
  })

  it('clamps out-of-range indices', () => {
    const trace = traceOf(20)
    expect(stateAt(trace, -5).index).toBe(0)
    expect(stateAt(trace, trace.steps.length + 100).index).toBe(trace.steps.length)
  })
})

describe('runSort keyframes', () => {
  it('attaches keyframes to the trace it returns', () => {
    const trace = traceOf(60)
    expect(trace.keyframes.length).toBeGreaterThan(0)
    expect(trace.keyframes[0].index).toBe(0)
  })
})

/**
 * Recursive merge sort that exercises every Step variant and every
 * FrameState field: markRange/markPivot before each merge, markSorted and
 * clearMarks after, and an aux buffer (allocated once) for the actual
 * merging — unlike `bubble` above, which never touches pivot, range, or aux.
 */
const mergeSortWithMarks = (a: TrackedArray) => {
  const aux = a.alloc(a.length)
  const go = (lo: number, hi: number): void => {
    if (hi - lo <= 1) return
    const mid = (lo + hi) >> 1
    a.markRange(lo, hi - 1)
    a.markPivot(mid)
    go(lo, mid)
    go(mid, hi)
    for (let i = lo; i < hi; i++) aux.set(i, a.get(i))
    let i = lo
    let j = mid
    let k = lo
    while (i < mid && j < hi) {
      if (aux.compare(i, j) <= 0) a.set(k++, aux.get(i++))
      else a.set(k++, aux.get(j++))
    }
    while (i < mid) a.set(k++, aux.get(i++))
    while (j < hi) a.set(k++, aux.get(j++))
    a.clearMarks()
    a.markSorted(...Array.from({ length: hi - lo }, (_, x) => lo + x))
  }
  go(0, a.length)
}

const mergeTraceOf = (n: number) => {
  const input = Array.from({ length: n }, (_, i) => (i * 7919) % n)
  const r = runSort(mergeSortWithMarks, input)
  if (!r.ok) throw new Error('run failed')
  return r.trace
}

/**
 * Every field of a FrameState, with typed arrays flattened to plain arrays so
 * a deep-equal over the whole object is meaningful (toEqual on two different
 * typed-array instances compares by index, but a length mismatch or a null
 * aux would otherwise read oddly, and Object.entries is the point here).
 *
 * Deliberately field-*agnostic*: the bug this whole file exists to catch is a
 * FrameState field that `applyStep` maintains and `restore()` forgets to
 * bring back from the keyframe — pivot and range were exactly that once.
 * TypeScript cannot catch it (excess-property checks catch extra fields,
 * never omitted ones), so an assertion that names the fields it compares
 * misses every field added after it was written. This one covers whatever
 * FrameState happens to contain.
 */
const flatten = (s: FrameState): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(s)) {
    out[key] = ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value
  }
  return out
}

describe('stateAt (full FrameState parity across keyframe boundaries)', () => {
  it('matches a linear replay on every field, at and around keyframe boundaries', () => {
    // n=400 comfortably clears 5000 steps for merge sort's O(n log n) work,
    // and its aux buffer, pivot, and range marks are all exercised.
    const trace = mergeTraceOf(400)
    expect(trace.steps.length).toBeGreaterThanOrEqual(5000)
    expect(trace.auxLength).toBeGreaterThan(0)

    // 1999/2000/2001 and 3999/4000/4001 straddle the real default
    // KEYFRAME_INTERVAL (2000) used here via runSort/buildKeyframes.
    const picks = [
      0,
      1,
      1999,
      2000,
      2001,
      3999,
      4000,
      4001,
      Math.floor(trace.steps.length / 2),
      trace.steps.length,
    ]

    for (const index of picks) {
      const i = Math.min(index, trace.steps.length)
      const fast = stateAt(trace, i)
      const slow = linearStateAt(trace, i)

      // One assertion over the whole state, every field of it, by name or not.
      expect(flatten(fast)).toEqual(flatten(slow))
      expect(fast.aux).not.toBeNull()
      expect(fast.index).toBe(i)
    }
  })

  it('also holds with a small custom keyframe interval', () => {
    const trace = mergeTraceOf(120)
    const withTightKeyframes = {
      ...trace,
      keyframes: buildKeyframes(trace.input, trace.steps, trace.auxLength, 37),
    }
    const picks = [
      0,
      1,
      36,
      37,
      38,
      73,
      74,
      75,
      Math.floor(trace.steps.length / 2),
      trace.steps.length,
    ]

    for (const index of picks) {
      const i = Math.min(index, trace.steps.length)
      const fast = stateAt(withTightKeyframes, i)
      const slow = linearStateAt(trace, i)

      expect(flatten(fast)).toEqual(flatten(slow))
      expect(fast.index).toBe(i)
    }
  })
})
