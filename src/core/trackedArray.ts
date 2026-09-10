import { Budget } from './limits'
import { emptyCounts, type Counts, type Lane, type MarkKind, type Step } from './types'

export interface AuxArray {
  readonly length: number
  get(i: number): number
  set(i: number, v: number): void
  /** Compares two elements of the auxiliary buffer. Merge sort needs this. */
  compare(i: number, j: number): -1 | 0 | 1
}

/**
 * The array every sorting function operates on — built-in and user-written alike.
 * Every operation appends a Step, and those Steps are the entire animation.
 */
export class TrackedArray {
  readonly length: number
  readonly steps: Step[] = []

  private readonly data: Float64Array
  private aux: Float64Array | null = null
  private readonly counters: Counts = emptyCounts()

  constructor(input: readonly number[], private readonly budget: Budget) {
    this.data = Float64Array.from(input)
    this.length = input.length
  }

  get counts(): Counts {
    return { ...this.counters }
  }

  get auxLength(): number {
    return this.aux ? this.aux.length : 0
  }

  snapshot(): number[] {
    return Array.from(this.data)
  }

  auxSnapshot(): number[] {
    return this.aux ? Array.from(this.aux) : []
  }

  get(i: number): number {
    this.bounds(i, this.length)
    this.record({ t: 'read', lane: 0, i })
    this.counters.reads++
    return this.data[i]
  }

  set(i: number, v: number): void {
    this.bounds(i, this.length)
    this.record({ t: 'write', lane: 0, i, value: v })
    this.counters.writes++
    this.data[i] = v
  }

  /** Returns -1, 0 or 1 — the sign of data[i] - data[j]. */
  compare(i: number, j: number): -1 | 0 | 1 {
    this.bounds(i, this.length)
    this.bounds(j, this.length)
    const result = sign(this.data[i] - this.data[j])
    this.record({ t: 'compare', lane: 0, i, j, result })
    this.counters.compares++
    return result
  }

  /** Compares element i against a value held outside the array. */
  compareValue(i: number, v: number): -1 | 0 | 1 {
    return sign(this.get(i) - v)
  }

  swap(i: number, j: number): void {
    this.bounds(i, this.length)
    this.bounds(j, this.length)
    this.record({ t: 'swap', lane: 0, i, j })
    this.counters.swaps++
    const tmp = this.data[i]
    this.data[i] = this.data[j]
    this.data[j] = tmp
  }

  /** Allocates the auxiliary buffer. One per run; calling twice throws. */
  alloc(n: number): AuxArray {
    if (this.aux) throw new Error('alloc() may only be called once per run')
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`Bad aux length: ${n}`)
    this.aux = new Float64Array(n)
    const self = this
    return {
      get length() {
        return n
      },
      get(i: number): number {
        self.bounds(i, n)
        self.record({ t: 'read', lane: 1, i })
        self.counters.reads++
        return self.aux![i]
      },
      set(i: number, v: number): void {
        self.bounds(i, n)
        self.record({ t: 'write', lane: 1, i, value: v })
        self.counters.writes++
        self.aux![i] = v
      },
      compare(i: number, j: number): -1 | 0 | 1 {
        self.bounds(i, n)
        self.bounds(j, n)
        const result = sign(self.aux![i] - self.aux![j])
        self.record({ t: 'compare', lane: 1, i, j, result })
        self.counters.compares++
        return result
      },
    }
  }

  markPivot(i: number): void {
    this.record({ t: 'mark', kind: 'pivot', indices: [i] })
  }

  markSorted(...indices: number[]): void {
    this.record({ t: 'mark', kind: 'sorted', indices })
  }

  markRange(lo: number, hi: number): void {
    this.record({ t: 'mark', kind: 'range', indices: [lo, hi] })
  }

  clearMarks(): void {
    this.mark('clear', [])
  }

  private mark(kind: MarkKind, indices: number[]): void {
    this.record({ t: 'mark', kind, indices })
  }

  private record(step: Step): void {
    this.budget.tick()
    this.steps.push(step)
  }

  private bounds(i: number, len: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= len) {
      throw new RangeError(`Index ${i} is outside 0..${len - 1}`)
    }
  }
}

function sign(d: number): -1 | 0 | 1 {
  return d < 0 ? -1 : d > 0 ? 1 : 0
}

export type { Lane }
