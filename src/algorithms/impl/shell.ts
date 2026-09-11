import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'shell',
  name: 'Shell sort',
  family: 'insertion',
  best: 'O(n log n)',
  average: 'O(n^1.25)',
  worst: 'O(n^1.5)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Insertion sort applied to interleaved subsequences with a shrinking gap, using the Ciura sequence. Early wide passes move elements a long way cheaply, so the final gap-1 pass has almost nothing left to do.',
}

export function sort(a: TrackedArray): void {
  const GAPS = [1750, 701, 301, 132, 57, 23, 10, 4, 1]

  for (const gap of GAPS) {
    if (gap >= a.length) continue
    for (let i = gap; i < a.length; i++) {
      let j = i
      while (j >= gap && a.compare(j - gap, j) > 0) {
        a.swap(j - gap, j)
        j -= gap
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
