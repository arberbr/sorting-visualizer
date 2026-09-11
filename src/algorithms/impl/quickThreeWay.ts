import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-three-way',
  name: 'Quicksort (3-way)',
  family: 'divide-and-conquer',
  best: 'O(n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    "Dijkstra's Dutch national flag partition splits into less-than, equal-to and greater-than regions. Elements equal to the pivot are finished immediately, so arrays with few distinct values sort in linear time.",
}

export function sort(a: TrackedArray): void {
  const qs = (lo: number, hi: number) => {
    if (lo >= hi) {
      if (lo === hi) a.markSorted(lo)
      return
    }
    a.markRange(lo, hi)
    const pivotIndex = lo + ((hi - lo) >> 1)
    a.markPivot(pivotIndex)
    const pivot = a.get(pivotIndex)

    let lt = lo
    let i = lo
    let gt = hi
    while (i <= gt) {
      const c = a.compareValue(i, pivot)
      if (c < 0) a.swap(lt++, i++)
      else if (c > 0) a.swap(i, gt--)
      else i++
    }
    a.clearMarks()
    for (let k = lt; k <= gt; k++) a.markSorted(k)

    qs(lo, lt - 1)
    qs(gt + 1, hi)
  }

  qs(0, a.length - 1)
}
