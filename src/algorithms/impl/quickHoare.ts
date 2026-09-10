import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-hoare',
  name: 'Quicksort (Hoare)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    "Hoare's original scheme: two cursors walk inward and swap the pairs they find out of place. It performs roughly three times fewer swaps than Lomuto and handles duplicate-heavy input far better.",
}

export function sort(a: TrackedArray): void {
  const partition = (lo: number, hi: number): number => {
    const pivotIndex = lo + ((hi - lo) >> 1)
    a.markPivot(pivotIndex)
    const pivot = a.get(pivotIndex)
    let i = lo - 1
    let j = hi + 1
    for (;;) {
      do i++
      while (a.compareValue(i, pivot) < 0)
      do j--
      while (a.compareValue(j, pivot) > 0)
      if (i >= j) {
        a.clearMarks()
        return j
      }
      a.swap(i, j)
    }
  }

  const qs = (lo: number, hi: number) => {
    if (lo >= hi) return
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    qs(lo, p)
    qs(p + 1, hi)
  }

  qs(0, a.length - 1)
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
