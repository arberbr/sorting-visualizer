import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

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

  // A frozen copy of the original values, compared through the tracked aux
  // lane rather than as detached plain numbers. `remaining`, `strand`, and
  // `result` below hold indices INTO this aux buffer, not raw values — the
  // buffer itself is never rewritten after this initial copy, so extracting
  // and merging strands can never read a value clobbered by an earlier
  // incremental write-back into the main array.
  const aux = a.alloc(a.length)
  for (let i = 0; i < a.length; i++) aux.set(i, a.get(i))

  const remaining: number[] = []
  for (let i = 0; i < a.length; i++) remaining.push(i)

  let result: number[] = []

  while (remaining.length > 0) {
    const strand: number[] = [remaining.shift() as number]
    for (let i = 0; i < remaining.length; ) {
      if (aux.compare(remaining[i], strand[strand.length - 1]) >= 0) {
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
      merged.push(aux.compare(result[x], strand[y]) <= 0 ? result[x++] : strand[y++])
    }
    while (x < result.length) merged.push(result[x++])
    while (y < strand.length) merged.push(strand[y++])
    result = merged

    // Show the merged prefix landing back in the array after each strand.
    for (let i = 0; i < result.length; i++) a.set(i, aux.get(result[i]))
    a.markRange(0, result.length - 1)
  }

  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
