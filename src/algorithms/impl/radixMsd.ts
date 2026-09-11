import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'radix-msd',
  name: 'Radix sort (MSD, base 10)',
  family: 'non-comparison',
  best: 'O(d * n)',
  average: 'O(d * n)',
  worst: 'O(d * n)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Buckets by the most significant digit first, then recurses into each bucket on the next digit down. Unlike LSD it can finish early once a bucket holds one element. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))
  let start = 1
  while (start * 10 <= max) start *= 10

  const msd = (lo: number, hi: number, exp: number) => {
    if (hi <= lo || exp < 1) return
    a.markRange(lo, hi)

    const buckets: number[][] = Array.from({ length: 10 }, () => [])
    for (let i = lo; i <= hi; i++) {
      const v = a.get(i)
      buckets[Math.floor(v / exp) % 10].push(v)
    }

    let k = lo
    const bounds: Array<[number, number]> = []
    for (const bucket of buckets) {
      const from = k
      for (const v of bucket) a.set(k++, v)
      bounds.push([from, k - 1])
    }

    for (const [from, to] of bounds) {
      if (to > from) msd(from, to, Math.floor(exp / 10))
    }
  }

  msd(0, a.length - 1, start)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
