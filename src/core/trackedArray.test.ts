import { describe, it, expect } from 'vitest'
import { TrackedArray } from './trackedArray'
import { Budget, LimitError } from './limits'

const budget = () => new Budget({ maxSteps: 1000, maxMillis: 10_000 })

describe('TrackedArray', () => {
  it('exposes length and reads values without mutating them', () => {
    const a = new TrackedArray([5, 2, 9], budget())
    expect(a.length).toBe(3)
    expect(a.get(2)).toBe(9)
    expect(a.snapshot()).toEqual([5, 2, 9])
  })

  it('records a read step', () => {
    const a = new TrackedArray([5], budget())
    a.get(0)
    expect(a.steps).toEqual([{ t: 'read', lane: 0, i: 0 }])
  })

  it('records a write step and applies it', () => {
    const a = new TrackedArray([5], budget())
    a.set(0, 7)
    expect(a.snapshot()).toEqual([7])
    expect(a.steps).toEqual([{ t: 'write', lane: 0, i: 0, value: 7 }])
  })

  it('compare returns the sign of the difference and records it', () => {
    const a = new TrackedArray([3, 1, 3], budget())
    expect(a.compare(0, 1)).toBe(1)
    expect(a.compare(1, 0)).toBe(-1)
    expect(a.compare(0, 2)).toBe(0)
    expect(a.steps[0]).toEqual({ t: 'compare', lane: 0, i: 0, j: 1, result: 1 })
  })

  it('compareValue compares an element against a loose value', () => {
    const a = new TrackedArray([3], budget())
    expect(a.compareValue(0, 10)).toBe(-1)
    expect(a.steps).toEqual([{ t: 'read', lane: 0, i: 0 }])
  })

  it('swap exchanges elements and records a single swap step', () => {
    const a = new TrackedArray([1, 2], budget())
    a.swap(0, 1)
    expect(a.snapshot()).toEqual([2, 1])
    expect(a.steps).toEqual([{ t: 'swap', lane: 0, i: 0, j: 1 }])
  })

  it('derives counts from the steps it recorded', () => {
    const a = new TrackedArray([3, 1], budget())
    a.compare(0, 1)
    a.swap(0, 1)
    a.get(0)
    a.set(1, 4)
    expect(a.counts).toEqual({ reads: 1, writes: 1, compares: 1, swaps: 1 })
  })

  it('alloc creates a second lane that records against lane 1', () => {
    const a = new TrackedArray([1, 2], budget())
    const aux = a.alloc(2)
    aux.set(0, 9)
    expect(aux.get(0)).toBe(9)
    expect(aux.length).toBe(2)
    expect(a.steps).toEqual([
      { t: 'write', lane: 1, i: 0, value: 9 },
      { t: 'read', lane: 1, i: 0 },
    ])
    expect(a.auxSnapshot()).toEqual([9, 0])
  })

  it('aux compares record against lane 1 and count as comparisons', () => {
    const a = new TrackedArray([1, 2], budget())
    const aux = a.alloc(2)
    aux.set(0, 5)
    aux.set(1, 2)
    expect(aux.compare(0, 1)).toBe(1)
    expect(a.steps.at(-1)).toEqual({ t: 'compare', lane: 1, i: 0, j: 1, result: 1 })
    expect(a.counts.compares).toBe(1)
  })

  it('refuses a second alloc', () => {
    const a = new TrackedArray([1], budget())
    a.alloc(1)
    expect(() => a.alloc(1)).toThrow(/once per run/)
  })

  it('records marks without touching data', () => {
    const a = new TrackedArray([1, 2, 3], budget())
    a.markPivot(1)
    a.markSorted(0, 2)
    a.markRange(0, 2)
    a.clearMarks()
    expect(a.steps).toEqual([
      { t: 'mark', kind: 'pivot', indices: [1] },
      { t: 'mark', kind: 'sorted', indices: [0, 2] },
      { t: 'mark', kind: 'range', indices: [0, 2] },
      { t: 'mark', kind: 'clear', indices: [] },
    ])
    expect(a.counts).toEqual({ reads: 0, writes: 0, compares: 0, swaps: 0 })
  })

  it('throws a RangeError on an out-of-bounds index', () => {
    const a = new TrackedArray([1], budget())
    expect(() => a.get(5)).toThrow(RangeError)
    expect(() => a.set(-1, 0)).toThrow(RangeError)
  })

  it('stops a runaway program via the budget', () => {
    const a = new TrackedArray([1, 2], new Budget({ maxSteps: 4, maxMillis: 10_000 }))
    expect(() => {
      for (let i = 0; i < 100; i++) a.get(0)
    }).toThrow(LimitError)
  })
})
