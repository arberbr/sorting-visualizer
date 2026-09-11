import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'odd-even',
  name: 'Odd-even sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Alternates between comparing all odd-indexed pairs and all even-indexed pairs. Every pair in a phase is independent, which is what makes this one trivially parallelisable in hardware.',
}

export function sort(a: TrackedArray): void {
  let sorted = false
  while (!sorted) {
    sorted = true
    for (let phase = 1; phase >= 0; phase--) {
      for (let i = phase; i + 1 < a.length; i += 2) {
        if (a.compare(i, i + 1) > 0) {
          a.swap(i, i + 1)
          sorted = false
        }
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
