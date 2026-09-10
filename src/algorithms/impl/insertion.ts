import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'insertion',
  name: 'Insertion sort',
  family: 'insertion',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Grows a sorted prefix one element at a time, sliding each new element left until it lands. Linear on nearly-sorted input, which is why real hybrid sorts fall back to it for small runs.',
}

export function sort(a: TrackedArray): void {
  for (let i = 1; i < a.length; i++) {
    a.markRange(0, i)
    let j = i
    while (j > 0 && a.compare(j - 1, j) > 0) {
      a.swap(j - 1, j)
      j--
    }
  }
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
