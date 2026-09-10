import { describe, it, expect } from 'vitest'
import { applyStep, createInitialState } from './frame'
import type { Step } from './types'

const state = () => createInitialState([5, 3, 8], 0)

describe('applyStep', () => {
  it('starts from the input with nothing marked', () => {
    const s = state()
    expect(Array.from(s.main)).toEqual([5, 3, 8])
    expect(s.index).toBe(0)
    expect(s.pivot).toBe(-1)
    expect(s.range).toBeNull()
    expect(Array.from(s.sorted)).toEqual([0, 0, 0])
  })

  it('applies a write and counts it', () => {
    const s = state()
    applyStep(s, { t: 'write', lane: 0, i: 1, value: 9 })
    expect(Array.from(s.main)).toEqual([5, 9, 8])
    expect(s.counts.writes).toBe(1)
    expect(s.index).toBe(1)
    expect(s.lastWrite[1]).toBe(0)
  })

  it('applies a swap and marks both indices as written', () => {
    const s = state()
    applyStep(s, { t: 'swap', lane: 0, i: 0, j: 2 })
    expect(Array.from(s.main)).toEqual([8, 3, 5])
    expect(s.counts.swaps).toBe(1)
    expect(s.lastWrite[0]).toBe(0)
    expect(s.lastWrite[2]).toBe(0)
  })

  it('records compares against both indices without changing data', () => {
    const s = state()
    applyStep(s, { t: 'compare', lane: 0, i: 0, j: 1, result: 1 })
    expect(Array.from(s.main)).toEqual([5, 3, 8])
    expect(s.counts.compares).toBe(1)
    expect(s.lastCompare[0]).toBe(0)
    expect(s.lastCompare[1]).toBe(0)
  })

  it('applies aux-lane writes to the aux buffer only', () => {
    const s = createInitialState([1, 2], 2)
    applyStep(s, { t: 'write', lane: 1, i: 0, value: 7 })
    expect(Array.from(s.aux!)).toEqual([7, 0])
    expect(Array.from(s.main)).toEqual([1, 2])
  })

  it('applies marks', () => {
    const s = state()
    const steps: Step[] = [
      { t: 'mark', kind: 'pivot', indices: [2] },
      { t: 'mark', kind: 'range', indices: [0, 1] },
      { t: 'mark', kind: 'sorted', indices: [0, 2] },
    ]
    for (const step of steps) applyStep(s, step)
    expect(s.pivot).toBe(2)
    expect(s.range).toEqual([0, 1])
    expect(Array.from(s.sorted)).toEqual([1, 0, 1])

    applyStep(s, { t: 'mark', kind: 'clear', indices: [] })
    expect(s.pivot).toBe(-1)
    expect(s.range).toBeNull()
    expect(Array.from(s.sorted)).toEqual([1, 0, 1])
  })
})
