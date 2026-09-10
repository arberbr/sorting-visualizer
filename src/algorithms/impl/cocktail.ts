import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'cocktail',
  name: 'Cocktail shaker sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Bubble sort that alternates direction. Forward passes push the largest element right, backward passes push the smallest left, so the sorted region grows from both ends.',
}

export function sort(a: TrackedArray): void {
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    let swapped = false
    for (let i = lo; i < hi; i++) {
      if (a.compare(i, i + 1) > 0) {
        a.swap(i, i + 1)
        swapped = true
      }
    }
    a.markSorted(hi)
    hi--
    for (let i = hi; i > lo; i--) {
      if (a.compare(i - 1, i) > 0) {
        a.swap(i - 1, i)
        swapped = true
      }
    }
    a.markSorted(lo)
    lo++
    if (!swapped) break
  }
  for (let i = lo; i <= hi; i++) a.markSorted(i)
}
