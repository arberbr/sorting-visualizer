import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bitonic',
  name: 'Bitonic sort',
  family: 'network',
  best: 'O(n log^2 n)',
  average: 'O(n log^2 n)',
  worst: 'O(n log^2 n)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'A sorting network: the sequence of comparisons is fixed in advance and does not depend on the data. Worse than n log n on one processor, but every comparison in a stage is independent, so hardware runs a whole stage at once.',
}

export function sort(a: TrackedArray): void {
  /** Largest power of two strictly less than n — this is what lets n be arbitrary. */
  const halfPowerOfTwo = (n: number): number => {
    let k = 1
    while (k < n) k <<= 1
    return k >> 1
  }

  const bitonicMerge = (lo: number, n: number, ascending: boolean) => {
    if (n <= 1) return
    const m = halfPowerOfTwo(n)
    for (let i = lo; i < lo + n - m; i++) {
      if (a.compare(i, i + m) > 0 === ascending) a.swap(i, i + m)
    }
    bitonicMerge(lo, m, ascending)
    bitonicMerge(lo + m, n - m, ascending)
  }

  const bitonicSort = (lo: number, n: number, ascending: boolean) => {
    if (n <= 1) return
    const m = n >> 1
    bitonicSort(lo, m, !ascending)
    bitonicSort(lo + m, n - m, ascending)
    a.markRange(lo, lo + n - 1)
    bitonicMerge(lo, n, ascending)
  }

  bitonicSort(0, a.length, true)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
