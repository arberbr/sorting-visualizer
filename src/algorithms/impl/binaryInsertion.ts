import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'binary-insertion',
  name: 'Binary insertion sort',
  family: 'insertion',
  best: 'O(n log n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Insertion sort that binary-searches for the landing position instead of scanning. Comparisons drop to O(n log n), but the elements still have to be shifted, so the moves stay quadratic.',
}

export function sort(a: TrackedArray): void {
  for (let i = 1; i < a.length; i++) {
    const key = a.get(i)
    let lo = 0
    let hi = i
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (a.compareValue(mid, key) <= 0) lo = mid + 1
      else hi = mid
    }
    for (let j = i; j > lo; j--) a.swap(j - 1, j)
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
