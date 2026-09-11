import { describe, expect, it } from 'vitest'
import {
  DISTRIBUTIONS,
  type Distribution,
  generate,
  MAX_N,
  MIN_N,
  makeRng,
  RACE_MAX_N,
} from './generate'

describe('makeRng', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const c = makeRng(43)
    const seqA = [a(), a(), a()]
    expect(seqA).toEqual([b(), b(), b()])
    expect(seqA).not.toEqual([c(), c(), c()])
  })

  it('stays inside [0, 1)', () => {
    const r = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generate', () => {
  const all = DISTRIBUTIONS.map((d) => d.id)

  it('covers every distribution in the exported list', () => {
    expect(all).toHaveLength(8)
  })

  it.each(all)('%s produces n integers within 1..n', (dist: Distribution) => {
    const out = generate(50, dist, 1)
    expect(out).toHaveLength(50)
    for (const v of out) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(50)
    }
  })

  it.each(all)('%s is reproducible from its seed', (dist: Distribution) => {
    expect(generate(40, dist, 99)).toEqual(generate(40, dist, 99))
  })

  it('reversed is strictly descending', () => {
    const out = generate(10, 'reversed', 1)
    expect(out).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('all-equal is constant', () => {
    expect(new Set(generate(30, 'all-equal', 1)).size).toBe(1)
  })

  it('few-unique has a small number of distinct values', () => {
    expect(new Set(generate(100, 'few-unique', 1)).size).toBeLessThanOrEqual(6)
  })

  it('nearly-sorted has far fewer inversions than random', () => {
    const inversions = (a: number[]) => {
      let c = 0
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++
      return c
    }
    expect(inversions(generate(80, 'nearly-sorted', 3))).toBeLessThan(
      inversions(generate(80, 'random', 3)) / 4,
    )
  })

  it('single-outlier is sorted except for one displaced element', () => {
    const out = generate(20, 'single-outlier', 5)
    const sorted = [...out].sort((x, y) => x - y)
    expect(out).not.toEqual(sorted)
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('rejects sizes outside the supported range', () => {
    expect(() => generate(2, 'random', 1)).toThrow(RangeError)
    expect(() => generate(5000, 'random', 1)).toThrow(RangeError)
  })
})

describe('RACE_MAX_N', () => {
  it('is a legal array size below the single-run ceiling', () => {
    expect(RACE_MAX_N).toBeGreaterThanOrEqual(MIN_N)
    expect(RACE_MAX_N).toBeLessThan(MAX_N)
    expect(() => generate(RACE_MAX_N, 'random', 1)).not.toThrow()
  })
})
