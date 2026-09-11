import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

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
    // Compare directly against index i rather than a value pulled out of it:
    // the binary search below only reads positions strictly left of i (mid < i),
    // and the shift that moves element i happens after the search concludes, so
    // index i still holds its own value for the whole search — and the compare
    // is then a real TrackedArray comparison instead of an off-array read.
    let lo = 0
    let hi = i
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (a.compare(mid, i) <= 0) lo = mid + 1
      else hi = mid
    }
    for (let j = i; j > lo; j--) a.swap(j - 1, j)
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
