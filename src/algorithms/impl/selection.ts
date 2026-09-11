import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'selection',
  name: 'Selection sort',
  family: 'selection',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Scans the unsorted region for the smallest element and swaps it into place. Always makes exactly n-1 swaps regardless of input, which makes it the cheapest quadratic sort when writes are expensive.',
}

export function sort(a: TrackedArray): void {
  for (let i = 0; i + 1 < a.length; i++) {
    a.markRange(i, a.length - 1)
    let min = i
    for (let j = i + 1; j < a.length; j++) if (a.compare(j, min) < 0) min = j
    if (min !== i) a.swap(i, min)
    a.markSorted(i)
  }
  a.clearMarks()
  if (a.length > 0) a.markSorted(a.length - 1)
}
