import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bogo',
  name: 'Bogosort',
  family: 'curiosity',
  best: 'O(n)',
  average: 'O(n * n!)',
  worst: 'O(infinity)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Shuffles the array and checks whether it happens to be sorted, forever. Included as the reference point for what a bad algorithm actually looks like. Capped at 8 elements, and it will still take a while.',
  maxN: 8,
}

export function sort(a: TrackedArray): void {
  // A fixed seed keeps runs reproducible, so the same array always animates the same way.
  let seed = 0x2f6e2b1
  const rnd = () => {
    // Math.imul returns a signed 32-bit result, so the product can be negative;
    // `% 0x7fffffff` then keeps that sign, and a plain `>>> 0` would reinterpret
    // a small negative remainder as a huge unsigned one, pushing rnd() past 1
    // and producing an out-of-range swap index. Shift negative remainders back
    // into range instead.
    seed = Math.imul(seed, 48271) % 0x7fffffff
    if (seed < 0) seed += 0x7fffffff
    return seed / 0x7fffffff
  }

  const isSorted = () => {
    for (let i = 1; i < a.length; i++) if (a.compare(i - 1, i) > 0) return false
    return true
  }

  while (!isSorted()) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      if (i !== j) a.swap(i, j)
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
