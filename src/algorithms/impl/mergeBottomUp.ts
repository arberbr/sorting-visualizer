import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'merge-bottom-up',
  name: 'Merge sort (bottom-up)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'The same merges as top-down, driven by a doubling width instead of recursion. No call stack, and the passes are visible as an obvious rhythm: pairs, then fours, then eights.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const aux = a.alloc(a.length)

  const merge = (lo: number, mid: number, hi: number) => {
    for (let i = lo; i <= hi; i++) aux.set(i, a.get(i))
    let i = lo
    let j = mid + 1
    for (let k = lo; k <= hi; k++) {
      if (i > mid) a.set(k, aux.get(j++))
      else if (j > hi) a.set(k, aux.get(i++))
      else if (aux.compare(j, i) < 0) a.set(k, aux.get(j++))
      else a.set(k, aux.get(i++))
    }
  }

  for (let width = 1; width < a.length; width *= 2) {
    for (let lo = 0; lo + width < a.length; lo += 2 * width) {
      const mid = lo + width - 1
      const hi = Math.min(lo + 2 * width - 1, a.length - 1)
      a.markRange(lo, hi)
      merge(lo, mid, hi)
    }
  }
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
