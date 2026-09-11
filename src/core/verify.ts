/**
 * Checks a finished run against the only answer that counts: the result must
 * hold exactly the values the run started with, in ascending order — that is,
 * it must equal `[...input].sort((a, b) => a - b)` element for element.
 *
 * Order alone is not a correctness check. `for (i) arr.set(i, 0)` leaves a
 * perfectly ascending array and has destroyed every value in it; comparing
 * against the sorted input catches that, and catches duplicated, dropped or
 * invented elements with it.
 *
 * `firstUnsorted` is the first index where the result differs from that
 * answer, or -1 when it doesn't — the index a viewer should look at first.
 */
export function checkSorted(
  final: readonly number[],
  input: readonly number[],
): { sorted: boolean; firstUnsorted: number } {
  const expected = [...input].sort((a, b) => a - b)
  if (final.length !== expected.length) {
    return { sorted: false, firstUnsorted: Math.min(final.length, expected.length) }
  }
  for (let i = 0; i < expected.length; i++) {
    if (!same(final[i], expected[i])) return { sorted: false, firstUnsorted: i }
  }
  return { sorted: true, firstUnsorted: -1 }
}

/** `===` but with NaN equal to itself, so a NaN in the input isn't a false alarm. */
function same(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b))
}
