import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

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
    'Shuffles the array and checks whether it happens to be sorted, forever. Included as the reference point for what a bad algorithm actually looks like. Capped at 7 elements, and it will still take a while.',
  maxN: 7,
}

export function sort(a: TrackedArray): void {
  // A fixed seed keeps runs reproducible, so the same array always animates the same way.
  // Full-period Park-Miller (Lehmer) generator: modulus 2^31-1 (2147483647, prime),
  // multiplier 48271. The product of two values below 2^31 stays well under 2^53,
  // so plain float arithmetic is exact here — no truncation, no precision loss.
  // (An earlier version used Math.imul, which truncates its inputs to 32 bits
  // BEFORE the modulus is applied; that silently breaks the full-period
  // construction and collapsed the generator's actual cycle down to ~79,000
  // states instead of the intended ~2.1 billion.)
  let seed = 0x2f6e2b1
  const rnd = () => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
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
