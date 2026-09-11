import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'timsort',
  name: 'Timsort (simplified)',
  family: 'divide-and-conquer',
  best: 'O(n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Insertion-sorts fixed runs of 32, then merges runs of doubling width. This is the shape of the real Timsort in Python and Java, minus its galloping mode and run-length invariants.',
}

export function sort(a: TrackedArray): void {
  const RUN = 32

  if (a.length < 2) return
  const aux = a.alloc(a.length)

  const insertion = (lo: number, hi: number) => {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i
      while (j > lo && a.compare(j - 1, j) > 0) {
        a.swap(j - 1, j)
        j--
      }
    }
  }

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

  for (let lo = 0; lo < a.length; lo += RUN) {
    const hi = Math.min(lo + RUN - 1, a.length - 1)
    a.markRange(lo, hi)
    insertion(lo, hi)
  }

  for (let width = RUN; width < a.length; width *= 2) {
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
