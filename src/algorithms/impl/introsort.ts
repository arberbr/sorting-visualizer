import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'introsort',
  name: 'Introsort',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    'Quicksort until the recursion gets too deep, then heapsort for that subrange, then insertion sort for small ranges. This hybrid is what most C++ standard libraries actually ship as std::sort.',
}

export function sort(a: TrackedArray): void {
  const SMALL = 16

  const insertion = (lo: number, hi: number) => {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i
      while (j > lo && a.compare(j - 1, j) > 0) {
        a.swap(j - 1, j)
        j--
      }
    }
  }

  const siftDown = (lo: number, root: number, count: number) => {
    while (2 * root + 1 < count) {
      let child = 2 * root + 1
      if (child + 1 < count && a.compare(lo + child, lo + child + 1) < 0) child++
      if (a.compare(lo + root, lo + child) >= 0) return
      a.swap(lo + root, lo + child)
      root = child
    }
  }

  const heap = (lo: number, hi: number) => {
    const count = hi - lo + 1
    for (let i = (count >> 1) - 1; i >= 0; i--) siftDown(lo, i, count)
    for (let end = count - 1; end > 0; end--) {
      a.swap(lo, lo + end)
      siftDown(lo, 0, end)
    }
  }

  const partition = (lo: number, hi: number): number => {
    const mid = lo + ((hi - lo) >> 1)
    if (a.compare(mid, lo) < 0) a.swap(mid, lo)
    if (a.compare(hi, lo) < 0) a.swap(hi, lo)
    if (a.compare(hi, mid) < 0) a.swap(hi, mid)
    a.swap(mid, hi)
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

  const intro = (lo: number, hi: number, depth: number) => {
    if (lo >= hi) return
    if (hi - lo + 1 <= SMALL) {
      insertion(lo, hi)
      return
    }
    if (depth === 0) {
      heap(lo, hi)
      return
    }
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    intro(lo, p - 1, depth - 1)
    intro(p + 1, hi, depth - 1)
  }

  const maxDepth = a.length > 1 ? 2 * Math.floor(Math.log2(a.length)) : 1
  intro(0, a.length - 1, maxDepth)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
