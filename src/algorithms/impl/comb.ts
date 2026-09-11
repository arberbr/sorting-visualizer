import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'comb',
  name: 'Comb sort',
  family: 'exchange',
  best: 'O(n log n)',
  average: 'O(n^2 / 2^p)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Bubble sort with a shrinking gap. Large gaps kill distant small values (turtles) early, and the gap divides by 1.3 each pass until it reaches 1 and the final pass is an ordinary bubble pass.',
}

export function sort(a: TrackedArray): void {
  let gap = a.length
  let swapped = true
  while (gap > 1 || swapped) {
    gap = Math.max(1, Math.floor(gap / 1.3))
    swapped = false
    for (let i = 0; i + gap < a.length; i++) {
      if (a.compare(i, i + gap) > 0) {
        a.swap(i, i + gap)
        swapped = true
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
