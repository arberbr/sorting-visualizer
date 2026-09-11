import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'cycle',
  name: 'Cycle sort',
  family: 'insertion',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Counts how many elements are smaller than the held value to compute exactly where it belongs, then places it and picks up whatever was there. Writes are theoretically minimal — no element is ever written twice.',
}

export function sort(a: TrackedArray): void {
  /** Writes `item` at `pos` and returns whatever was displaced. */
  const place = (pos: number, item: number): number => {
    const held = a.get(pos)
    a.set(pos, item)
    return held
  }

  for (let start = 0; start + 1 < a.length; start++) {
    let item = a.get(start)

    let pos = start
    for (let i = start + 1; i < a.length; i++) if (a.compareValue(i, item) < 0) pos++
    if (pos === start) continue

    while (a.compareValue(pos, item) === 0) pos++
    item = place(pos, item)
    a.markSorted(pos)

    while (pos !== start) {
      pos = start
      for (let i = start + 1; i < a.length; i++) if (a.compareValue(i, item) < 0) pos++
      while (a.compareValue(pos, item) === 0) pos++
      item = place(pos, item)
      a.markSorted(pos)
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
