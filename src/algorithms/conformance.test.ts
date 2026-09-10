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
  // Small enough to still be covered by algorithms capped at maxN 7 (bogo) —
  // without this, a maxN:7 algorithm would only ever be exercised on 0-2 elements.
  { name: 'reversed (7)', input: [7, 6, 5, 4, 3, 2, 1] },
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
      // Guards the convention extractSortSource relies on: `sort` must be the
      // last thing in the file, so nothing declared after it leaks into the
      // code panel (Task 17). A trailing helper would break this.
      const sourceLines = a.source.split('\n').filter((line) => line.trim() !== '')
      expect(
        sourceLines[sourceLines.length - 1]?.trim(),
        `${a.meta.id}: source should end with '}' as its last non-empty line — a declaration after sort() would leak into the code panel`,
      ).toBe('}')
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

    // The "confirmed sorted" region the UI shows the user is a claim: this
    // index is in its final position. A mark step is never allowed to fire
    // before the index it names actually holds that final value — this does
    // NOT require an algorithm to mark everything or to mark early; several
    // of these six legitimately mark only once at the very end.
    //
    // Stressed over 'random' plus two duplicate-heavy distributions: `generate`'s
    // 'random' is a shuffled permutation of 1..n with no repeated values at all,
    // so on its own this invariant was never exercised against duplicate handling
    // — exactly what the non-comparison algorithms (counting, pigeonhole, ...)
    // are built out of.
    it.each(['random', 'few-unique', 'all-equal'] as const)(
      'never marks an index sorted before it holds its final value (%s)',
      (dist) => {
        if (tiny) return
        const n = Math.min(40, algo.meta.maxN ?? 40)
        const input = generate(n, dist, 777)
        const r = runSort(algo.sort, input)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        const expected = [...input].sort((x, y) => x - y)
        const s = createInitialState(r.trace.input, r.trace.auxLength)
        r.trace.steps.forEach((step, stepIndex) => {
          applyStep(s, step)
          if (step.t === 'mark' && step.kind === 'sorted') {
            for (const i of step.indices) {
              expect(
                s.main[i],
                `${algo.meta.id}: index ${i} was marked sorted at step ${stepIndex} but holds ${s.main[i]}, expected final value ${expected[i]}`,
              ).toBe(expected[i])
            }
          }
        })
      },
    )

    // The counters shown in the UI are a claim about what the algorithm
    // actually did. `non-comparison` algorithms (counting, radix, bucket,
    // pigeonhole) are legitimately exempt — they read values instead of
    // comparing them, and `bucket` sorts within its buckets on plain values
    // by design. Every other algorithm's whole story is comparisons, so
    // reporting zero of them on non-trivial input would be a factual error
    // on screen, not a quirk of implementation. No further exceptions: this
    // is only self-enforcing if nothing can opt out. `compareValue` now
    // records its own comparison (see TrackedArray.compareValue /
    // Step['compare-value']), so algorithms that legitimately compare
    // against a detached value (cycle, quick-three-way, quick-hoare) no
    // longer need — or get — a carve-out.
    it('records at least one comparison on non-trivial input', () => {
      if (algo.meta.family === 'non-comparison') return
      const n = Math.min(8, algo.meta.maxN ?? 8)
      // Deliberately not `generate()` here: generate() refuses n below its
      // own MIN_N (8), which would exclude algorithms capped tighter than
      // that (bogo, maxN 7). A plain reversed run is non-trivial input for
      // every algorithm this test applies to.
      const input = Array.from({ length: n }, (_, i) => n - i)
      const r = runSort(algo.sort, input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.trace.counts.compares, algo.meta.id).toBeGreaterThan(0)
    })
  })
})
