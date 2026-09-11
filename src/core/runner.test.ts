import { describe, expect, it } from 'vitest'
import { runSort } from './runner'
import type { TrackedArray } from './trackedArray'
import { checkSorted } from './verify'

const bubble = (a: TrackedArray) => {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      if (a.compare(j, j + 1) > 0) a.swap(j, j + 1)
    }
  }
}

describe('checkSorted', () => {
  it('accepts sorted and empty arrays', () => {
    expect(checkSorted([], [])).toEqual({ sorted: true, firstUnsorted: -1 })
    expect(checkSorted([1, 1, 2, 3], [3, 1, 2, 1])).toEqual({ sorted: true, firstUnsorted: -1 })
  })

  it('reports the first index that differs from the answer', () => {
    expect(checkSorted([1, 3, 2], [1, 2, 3])).toEqual({ sorted: false, firstUnsorted: 1 })
  })

  it('rejects an ascending array that is not the input', () => {
    // The case order-only checking gets wrong: every value overwritten with
    // zero is flawlessly ascending and has destroyed the data.
    expect(checkSorted([0, 0, 0, 0], [3, 1, 2, 4])).toEqual({ sorted: false, firstUnsorted: 0 })
  })

  it('rejects a duplicated element, even in order', () => {
    expect(checkSorted([1, 1, 3], [1, 2, 3])).toEqual({ sorted: false, firstUnsorted: 1 })
  })

  it('rejects a result of the wrong length', () => {
    expect(checkSorted([1, 2], [1, 2, 3])).toEqual({ sorted: false, firstUnsorted: 2 })
  })
})

describe('runSort', () => {
  it('produces a trace and a sorted final array', () => {
    const r = runSort(bubble, [3, 1, 2])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([1, 2, 3])
    expect(r.sorted).toBe(true)
    expect(r.trace.input).toEqual([3, 1, 2])
    expect(r.trace.steps.length).toBeGreaterThan(0)
    expect(r.trace.counts.compares).toBeGreaterThan(0)
  })

  it('does not mutate the caller input array', () => {
    const input = [3, 1, 2]
    runSort(bubble, input)
    expect(input).toEqual([3, 1, 2])
  })

  it('succeeds but reports sorted: false for an incorrect algorithm', () => {
    const wrong = (a: TrackedArray) => {
      a.swap(0, 1)
    }
    const r = runSort(wrong, [1, 2, 3])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sorted).toBe(false)
    // [2, 1, 3] against the answer [1, 2, 3]: index 0 is already wrong.
    expect(r.firstUnsorted).toBe(0)
    expect(r.trace.steps).toHaveLength(1)
  })

  it('reports step-budget for an infinite loop', () => {
    const spin = (a: TrackedArray) => {
      for (;;) a.get(0)
    }
    const r = runSort(spin, [1, 2], { maxSteps: 500, maxMillis: 10_000 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('step-budget')
    expect(r.error.limit).toBe(500)
  })

  it('reports timeout when the clock runs out', () => {
    const slow = (a: TrackedArray) => {
      for (;;) a.get(0)
    }
    const r = runSort(slow, [1, 2], { maxSteps: 5_000_000, maxMillis: 1 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('timeout')
  })

  it('reports runtime errors thrown by the sort function', () => {
    const boom = () => {
      throw new TypeError('cannot read x of undefined')
    }
    const r = runSort(boom, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toContain('cannot read x of undefined')
  })

  it('reports not-a-function when handed something that is not callable', () => {
    const r = runSort(undefined as never, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('not-a-function')
  })

  it('rejects an async sort function instead of resolving with a premature snapshot', () => {
    // async functions are assignable to SortFn thanks to TS's void-return
    // special-casing, so ordinary user code can hand us one with no cast.
    const asyncSort: (a: TrackedArray) => void = async (a) => {
      await Promise.resolve()
      a.swap(0, 1)
    }
    const r = runSort(asyncSort, [3, 1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toMatch(/promise|synchronous/i)
  })

  it('does not leak an unhandled rejection when an async sort function rejects later', async () => {
    const asyncSort: (a: TrackedArray) => void = async () => {
      await Promise.resolve()
      throw new Error('async boom')
    }
    const r = runSort(asyncSort, [3, 1, 2])
    expect(r.ok).toBe(false)
    // Give the rejection a macrotask to surface. If runSort didn't attach a
    // handler to the returned promise, vitest fails this run with an
    // "Unhandled Rejection" error even though no assertion below fails.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('reports runtime for a non-Error thrown string', () => {
    const r = runSort(() => {
      throw 'a string'
    }, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toBeTruthy()
  })

  it('reports runtime for a thrown null', () => {
    const r = runSort(() => {
      throw null
    }, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toBeTruthy()
  })

  it('reports runtime for a thrown plain object', () => {
    const r = runSort(() => {
      throw { weird: true }
    }, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toBeTruthy()
  })

  it('treats an empty input array as already sorted', () => {
    const r = runSort(bubble, [])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sorted).toBe(true)
    expect(r.firstUnsorted).toBe(-1)
  })
})
