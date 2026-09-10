import type { TrackedArray } from './trackedArray'

/** 0 = the main array, 1 = the auxiliary buffer. */
export type Lane = 0 | 1

export type MarkKind = 'pivot' | 'sorted' | 'range' | 'clear'

export type Step =
  | { t: 'read'; lane: Lane; i: number }
  | { t: 'write'; lane: Lane; i: number; value: number }
  | { t: 'compare'; lane: Lane; i: number; j: number; result: -1 | 0 | 1 }
  | { t: 'swap'; lane: Lane; i: number; j: number }
  | { t: 'mark'; kind: MarkKind; indices: number[] }

export interface Counts {
  reads: number
  writes: number
  compares: number
  swaps: number
}

export const emptyCounts = (): Counts => ({ reads: 0, writes: 0, compares: 0, swaps: 0 })

export type SortFn = (arr: TrackedArray) => void

export type Family =
  | 'exchange'
  | 'insertion'
  | 'selection'
  | 'divide-and-conquer'
  | 'non-comparison'
  | 'network'
  | 'curiosity'

export interface AlgorithmMeta {
  id: string
  name: string
  family: Family
  best: string
  average: string
  worst: string
  space: string
  stable: boolean
  inPlace: boolean
  description: string
  /** Hard cap on array size for algorithms that would otherwise never finish. */
  maxN?: number
}
