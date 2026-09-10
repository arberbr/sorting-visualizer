import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'pigeonhole',
  name: 'Pigeonhole sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n + k)',
  space: 'O(k)',
  stable: true,
  inPlace: false,
  description:
    'Counting sort shifted by the minimum value, so the holes span only the range actually present. Fast when the value range is close to the element count, hopeless when it is not. Requires integer values.',
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

  const holes = a.alloc(max - min + 1)
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    holes.set(v - min, holes.get(v - min) + 1)
  }

  let k = 0
  for (let h = 0; h < holes.length; h++) {
    let remaining = holes.get(h)
    while (remaining-- > 0) {
      a.set(k, h + min)
      a.markSorted(k)
      k++
    }
  }
}
