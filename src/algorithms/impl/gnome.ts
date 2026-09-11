import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'gnome',
  name: 'Gnome sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Walks forward while the order holds and steps backward swapping whenever it does not. A single cursor and one comparison per move — the simplest sort that still terminates for the right reason.',
}

export function sort(a: TrackedArray): void {
  let i = 0
  while (i < a.length) {
    if (i === 0 || a.compare(i - 1, i) <= 0) {
      i++
    } else {
      a.swap(i - 1, i)
      i--
    }
  }
  for (let k = 0; k < a.length; k++) a.markSorted(k)
}
