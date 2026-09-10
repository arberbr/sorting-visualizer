import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'double-selection',
  name: 'Double selection sort',
  family: 'selection',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Selection sort that finds the minimum and the maximum in the same pass and places both, halving the number of passes. The subtlety is fixing up the maximum index when the first swap moves it.',
}

export function sort(a: TrackedArray): void {
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    let min = lo
    let max = lo
    for (let i = lo; i <= hi; i++) {
      if (a.compare(i, min) < 0) min = i
      if (a.compare(i, max) > 0) max = i
    }
    if (min !== lo) a.swap(lo, min)
    // The swap above may have moved the maximum out from under us.
    if (max === lo) max = min
    if (max !== hi) a.swap(hi, max)
    a.markSorted(lo, hi)
    lo++
    hi--
  }
  if (lo === hi) a.markSorted(lo)
}
