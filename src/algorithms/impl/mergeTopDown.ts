import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'merge-top-down',
  name: 'Merge sort (top-down)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Splits the range in half, sorts each half recursively, then merges them through an auxiliary buffer. The n log n bound holds on every input — no adversarial case exists.',
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

  const split = (lo: number, hi: number) => {
    if (lo >= hi) return
    const mid = lo + ((hi - lo) >> 1)
    split(lo, mid)
    split(mid + 1, hi)
    a.markRange(lo, hi)
    merge(lo, mid, hi)
  }

  split(0, a.length - 1)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
