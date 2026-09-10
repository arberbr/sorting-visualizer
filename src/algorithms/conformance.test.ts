import { describe, it, expect } from 'vitest'
import { ALGORITHMS } from './index'
import { runSort } from '../core/runner'
import { applyStep, createInitialState } from '../core/frame'
import { generate, type Distribution } from '../core/generate'

const FIXTURES: ReadonlyArray<{ name: string; input: number[] }> = [
  { name: 'empty', input: [] },
  { name: 'single', input: [1] },
  { name: 'pair sorted', input: [1, 2] },
  { name: 'pair reversed', input: [2, 1] },
  { name: 'all equal', input: [4, 4, 4, 4, 4, 4, 4, 4] },
  { name: 'duplicate heavy', input: [3, 1, 3, 2, 1, 2, 3, 1, 2, 3] },
  { name: 'already sorted', input: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'reversed', input: [8, 7, 6, 5, 4, 3, 2, 1] },
]

const DISTS: Distribution[] = ['random', 'nearly-sorted', 'reversed', 'few-unique', 'gaussian']

describe('every registered algorithm', () => {
  it('has unique ids', () => {
    const ids = ALGORITHMS.map((a) => a.meta.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has non-empty metadata and source', () => {
    for (const a of ALGORITHMS) {
      expect(a.meta.name, a.meta.id).not.toBe('')
      expect(a.meta.description.length, a.meta.id).toBeGreaterThan(20)
      expect(a.source, a.meta.id).toContain('function sort')
      for (const key of ['best', 'average', 'worst', 'space'] as const) {
        expect(a.meta[key], `${a.meta.id}.${key}`).toMatch(/O\(/)
      }
    }
  })

  describe.each(ALGORITHMS.map((a) => [a.meta.id, a] as const))('%s', (_id, algo) => {
    const cap = (n: number) => algo.meta.maxN === undefined || n <= algo.meta.maxN

    it.each(FIXTURES.filter((f) => cap(f.input.length)).map((f) => [f.name, f.input] as const))(
      'sorts fixture: %s',
      (_name, input) => {
        const r = runSort(algo.sort, input)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.finalArray).toEqual([...input].sort((x, y) => x - y))
        expect(r.sorted).toBe(true)
      },
    )

    // Algorithms capped below 16 elements (bogo, stooge) are proved by the
    // fixtures alone — generating 64-element inputs for them is not meaningful.
    const tiny = (algo.meta.maxN ?? 64) < 16

    it.each(DISTS)('sorts a generated %s array', (dist) => {
      if (tiny) return
      const n = Math.min(64, algo.meta.maxN ?? 64)
      const input = generate(n, dist, 12345)
      const r = runSort(algo.sort, input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.finalArray).toEqual([...input].sort((x, y) => x - y))
    })

    it('produces a trace that replays to the same final array', () => {
      if (tiny) return
      const n = Math.min(40, algo.meta.maxN ?? 40)
      const input = generate(n, 'random', 777)
      const r = runSort(algo.sort, input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const s = createInitialState(r.trace.input, r.trace.auxLength)
      for (const step of r.trace.steps) applyStep(s, step)
      expect(Array.from(s.main)).toEqual(r.finalArray)
      expect(s.counts).toEqual(r.trace.counts)
    })
  })
})
