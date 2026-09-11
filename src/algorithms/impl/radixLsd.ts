import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'radix-lsd',
  name: 'Radix sort (LSD, base 10)',
  family: 'non-comparison',
  best: 'O(d * n)',
  average: 'O(d * n)',
  worst: 'O(d * n)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Stably distributes elements by their least significant digit, then the next, and so on. Because each pass is stable, after the final digit the whole array is ordered. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const out = a.alloc(a.length)

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))

  for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
    // The digit histogram is bookkeeping, not array data, so it stays untracked.
    const count = new Array<number>(10).fill(0)
    for (let i = 0; i < a.length; i++) count[Math.floor(a.get(i) / exp) % 10]++
    for (let d = 1; d < 10; d++) count[d] += count[d - 1]
    for (let i = a.length - 1; i >= 0; i--) {
      const v = a.get(i)
      const d = Math.floor(v / exp) % 10
      out.set(--count[d], v)
    }
    for (let i = 0; i < a.length; i++) a.set(i, out.get(i))
  }

  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
