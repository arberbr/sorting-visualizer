import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'bubble',
  name: 'Bubble sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Repeatedly walks the array swapping adjacent elements that are out of order. Each pass floats the largest remaining element to the end, so the sorted region grows from the right.',
}

export function sort(a: TrackedArray): void {
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false
    for (let i = 0; i < end; i++) {
      if (a.compare(i, i + 1) > 0) {
        a.swap(i, i + 1)
        swapped = true
      }
    }
    a.markSorted(end)
    if (!swapped) {
      for (let i = 0; i < end; i++) a.markSorted(i)
      return
    }
  }
  if (a.length > 0) a.markSorted(0)
}
