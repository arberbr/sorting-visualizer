import { describe, it, expect } from 'vitest'
import { ALGORITHMS, algorithmsByFamily } from './index'
import { FAMILY_ORDER } from './families'

describe('algorithm coverage', () => {
  it('registers at least 28 algorithms', () => {
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(28)
  })

  it('populates every family', () => {
    expect(algorithmsByFamily().map((g) => g.family)).toEqual(FAMILY_ORDER)
  })

  it('includes the algorithms the spec names explicitly', () => {
    const ids = new Set(ALGORITHMS.map((a) => a.meta.id))
    for (const id of [
      'bubble', 'cocktail', 'odd-even', 'gnome', 'comb', 'pancake',
      'insertion', 'binary-insertion', 'shell', 'cycle',
      'selection', 'double-selection', 'heap',
      'merge-top-down', 'merge-bottom-up', 'quick-lomuto', 'quick-hoare',
      'quick-three-way', 'quick-median3', 'introsort', 'timsort',
      'counting', 'radix-lsd', 'radix-msd', 'bucket', 'pigeonhole',
      'bitonic', 'tree', 'strand', 'bogo', 'stooge',
    ]) {
      expect(ids, `missing algorithm: ${id}`).toContain(id)
    }
  })

  it('caps the algorithms that would otherwise never finish', () => {
    for (const id of ['bogo', 'stooge']) {
      const algo = ALGORITHMS.find((a) => a.meta.id === id)!
      expect(algo.meta.maxN, id).toBeGreaterThan(0)
    }
  })
})
