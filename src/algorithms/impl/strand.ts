import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'strand',
  name: 'Strand sort',
  family: 'network',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Repeatedly pulls out an increasing subsequence — a strand — and merges it into the result. Input that is already mostly ordered yields one long strand and finishes in linear time.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  const remaining: number[] = []
  for (let i = 0; i < a.length; i++) remaining.push(a.get(i))

  let result: number[] = []

  while (remaining.length > 0) {
    const strand: number[] = [remaining.shift() as number]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i] >= strand[strand.length - 1]) {
        strand.push(remaining[i])
        remaining.splice(i, 1)
      } else {
        i++
      }
    }

    const merged: number[] = []
    let x = 0
    let y = 0
    while (x < result.length && y < strand.length) {
      merged.push(result[x] <= strand[y] ? result[x++] : strand[y++])
    }
    while (x < result.length) merged.push(result[x++])
    while (y < strand.length) merged.push(strand[y++])
    result = merged

    // Show the merged prefix landing back in the array after each strand.
    for (let i = 0; i < result.length; i++) a.set(i, result[i])
    a.markRange(0, result.length - 1)
  }

  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
