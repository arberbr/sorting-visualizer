import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'stooge',
  name: 'Stooge sort',
  family: 'curiosity',
  best: 'O(n^2.71)',
  average: 'O(n^2.71)',
  worst: 'O(n^2.71)',
  space: 'O(n)',
  stable: false,
  inPlace: true,
  description:
    'Sorts the first two thirds, then the last two thirds, then the first two thirds again. Provably correct, spectacularly inefficient, and a genuinely useful exercise in why the recursion works. Capped at 64 elements.',
  maxN: 64,
}

export function sort(a: TrackedArray): void {
  const stooge = (lo: number, hi: number) => {
    if (lo >= hi) return
    if (a.compare(lo, hi) > 0) a.swap(lo, hi)
    if (hi - lo + 1 > 2) {
      const third = Math.floor((hi - lo + 1) / 3)
      stooge(lo, hi - third)
      stooge(lo + third, hi)
      stooge(lo, hi - third)
    }
  }

  stooge(0, a.length - 1)
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
