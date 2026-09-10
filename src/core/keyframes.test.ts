import { describe, it, expect } from 'vitest'
import { runSort } from './runner'
import { buildKeyframes, stateAt } from './keyframes'
import { applyStep, createInitialState } from './frame'
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
