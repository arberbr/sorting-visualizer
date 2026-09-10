/** Checks ascending order and reports where it first breaks. */
export function checkSorted(a: readonly number[]): { sorted: boolean; firstUnsorted: number } {
  for (let i = 1; i < a.length; i++) {
    if (a[i] < a[i - 1]) return { sorted: false, firstUnsorted: i }
  }
  return { sorted: true, firstUnsorted: -1 }
}
