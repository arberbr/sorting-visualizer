import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'pancake',
  name: 'Pancake sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'The only permitted operation is flipping a prefix, like a spatula under a stack of pancakes. Each round flips the largest remaining element to the front, then flips it into its final place.',
}

export function sort(a: TrackedArray): void {
  const flip = (k: number) => {
    for (let i = 0, j = k; i < j; i++, j--) a.swap(i, j)
  }

  for (let n = a.length; n > 1; n--) {
    let max = 0
    for (let i = 1; i < n; i++) if (a.compare(i, max) > 0) max = i
    if (max !== n - 1) {
      if (max > 0) flip(max)
      flip(n - 1)
    }
    a.markSorted(n - 1)
  }
  if (a.length > 0) a.markSorted(0)
}
