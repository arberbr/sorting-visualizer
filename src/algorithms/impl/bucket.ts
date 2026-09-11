import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'bucket',
  name: 'Bucket sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n^2)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Scatters values into buckets spanning equal slices of the value range, sorts each bucket with insertion sort, and concatenates. Linear when the input is spread evenly, quadratic when everything lands in one bucket.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === max) {
    for (let i = 0; i < a.length; i++) a.markSorted(i)
    return
  }

  const count = Math.max(2, Math.floor(Math.sqrt(a.length)))
  const buckets: number[][] = Array.from({ length: count }, () => [])
  const span = (max - min + 1) / count

  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    const b = Math.min(count - 1, Math.floor((v - min) / span))
    buckets[b].push(v)
  }

  let k = 0
  for (const bucket of buckets) {
    // Insertion sort within the bucket, on plain values.
    for (let i = 1; i < bucket.length; i++) {
      const key = bucket[i]
      let j = i - 1
      while (j >= 0 && bucket[j] > key) {
        bucket[j + 1] = bucket[j]
        j--
      }
      bucket[j + 1] = key
    }
    if (bucket.length > 0) a.markRange(k, k + bucket.length - 1)
    for (const v of bucket) {
      a.set(k, v)
      a.markSorted(k)
      k++
    }
  }
  a.clearMarks()
}
