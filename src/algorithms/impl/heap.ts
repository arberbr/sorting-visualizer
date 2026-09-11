import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'heap',
  name: 'Heapsort',
  family: 'selection',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Selection sort with a better data structure. Builds a max-heap in the array itself, then repeatedly swaps the root to the end and sifts down. Guaranteed n log n with no extra memory.',
}

export function sort(a: TrackedArray): void {
  const siftDown = (root: number, end: number) => {
    while (2 * root + 1 < end) {
      let child = 2 * root + 1
      if (child + 1 < end && a.compare(child, child + 1) < 0) child++
      if (a.compare(root, child) >= 0) return
      a.swap(root, child)
      root = child
    }
  }

  for (let i = (a.length >> 1) - 1; i >= 0; i--) siftDown(i, a.length)
  for (let end = a.length - 1; end > 0; end--) {
    a.swap(0, end)
    a.markSorted(end)
    siftDown(0, end)
  }
  if (a.length > 0) a.markSorted(0)
}
