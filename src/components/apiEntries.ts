export interface ApiEntry {
  member: string
  signature: string
  description: string
}

export const API_ENTRIES: readonly ApiEntry[] = [
  { member: 'length', signature: 'arr.length', description: 'How many elements the array holds.' },
  {
    member: 'get',
    signature: 'arr.get(i) -> number',
    description: 'Reads the value at index i and records a read.',
  },
  {
    member: 'set',
    signature: 'arr.set(i, v)',
    description: 'Writes v at index i and records a write.',
  },
  {
    member: 'compare',
    signature: 'arr.compare(i, j) -> -1 | 0 | 1',
    description: 'Compares two elements. Negative means the element at i is smaller.',
  },
  {
    member: 'compareValue',
    signature: 'arr.compareValue(i, v) -> -1 | 0 | 1',
    description:
      'Compares the element at i against a value you are holding outside the array, and records a real comparison against it.',
  },
  {
    member: 'swap',
    signature: 'arr.swap(i, j)',
    description: 'Exchanges two elements in one recorded operation.',
  },
  {
    member: 'alloc',
    signature: 'arr.alloc(n) -> aux',
    description:
      'Allocates an auxiliary buffer with its own get, set and compare, drawn beneath the main array. Once per run.',
  },
  {
    member: 'markPivot',
    signature: 'arr.markPivot(i)',
    description: 'Highlights index i as the current pivot.',
  },
  {
    member: 'markSorted',
    signature: 'arr.markSorted(...indices)',
    description: 'Marks indices as finished. They turn green and stay that way.',
  },
  {
    member: 'markRange',
    signature: 'arr.markRange(lo, hi)',
    description: 'Dims everything outside lo..hi to show the range you are working on.',
  },
  {
    member: 'clearMarks',
    signature: 'arr.clearMarks()',
    description: 'Clears the pivot and range marks. Sorted marks are kept.',
  },
  {
    member: 'counts',
    signature: 'arr.counts',
    description: 'Live totals for reads, writes, compares and swaps.',
  },
  {
    member: 'auxLength',
    signature: 'arr.auxLength',
    description: 'Length of the auxiliary buffer, or 0 when none was allocated.',
  },
  {
    member: 'snapshot',
    signature: 'arr.snapshot() -> number[]',
    description: 'A plain copy of the current values. Useful while debugging your own code.',
  },
  {
    member: 'auxSnapshot',
    signature: 'arr.auxSnapshot() -> number[]',
    description: 'A plain copy of the auxiliary buffer.',
  },
]
