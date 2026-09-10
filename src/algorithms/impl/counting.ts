import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'counting',
  name: 'Counting sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n + k)',
  space: 'O(k)',
  stable: true,
  inPlace: false,
  description:
    'Counts how many times each value occurs, then writes the values back in order. It never compares two elements at all, so the n log n lower bound simply does not apply. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))

  const tally = a.alloc(max + 1)
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    tally.set(v, tally.get(v) + 1)
  }

  let k = 0
  for (let v = 0; v <= max; v++) {
    let remaining = tally.get(v)
    while (remaining-- > 0) {
      a.set(k, v)
      a.markSorted(k)
      k++
    }
  }
}
