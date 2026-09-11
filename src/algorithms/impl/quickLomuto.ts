import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'quick-lomuto',
  name: 'Quicksort (Lomuto)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    'Takes the last element as the pivot and sweeps one cursor forward, swapping every smaller element into a growing left region. Simple to state, but degrades to quadratic on already-sorted input.',
}

export function sort(a: TrackedArray): void {
  const partition = (lo: number, hi: number): number => {
    a.markPivot(hi)
    let i = lo
    for (let j = lo; j < hi; j++) {
      if (a.compare(j, hi) < 0) {
        if (i !== j) a.swap(i, j)
        i++
      }
    }
    a.swap(i, hi)
    a.clearMarks()
    return i
  }

  const qs = (lo: number, hi: number) => {
    if (lo >= hi) {
      if (lo === hi) a.markSorted(lo)
      return
    }
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    a.markSorted(p)
    qs(lo, p - 1)
    qs(p + 1, hi)
  }

  qs(0, a.length - 1)
}
