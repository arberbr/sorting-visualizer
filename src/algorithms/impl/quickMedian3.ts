import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-median3',
  name: 'Quicksort (median of three)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    'Lomuto partitioning with the median of the first, middle and last elements parked as the pivot. Three comparisons of setup remove the quadratic behaviour on sorted and reversed input.',
}

export function sort(a: TrackedArray): void {
  const medianToEnd = (lo: number, hi: number) => {
    const mid = lo + ((hi - lo) >> 1)
    if (a.compare(mid, lo) < 0) a.swap(mid, lo)
    if (a.compare(hi, lo) < 0) a.swap(hi, lo)
    if (a.compare(hi, mid) < 0) a.swap(hi, mid)
    a.swap(mid, hi) // the median now sits at hi, ready to act as the pivot
  }

  const partition = (lo: number, hi: number): number => {
    medianToEnd(lo, hi)
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
