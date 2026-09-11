import { describe, expect, it } from 'vitest'
import { advance, MAX_STEPS_PER_FRAME } from './timing'

describe('advance', () => {
  it('converts elapsed time into whole steps at the given rate', () => {
    expect(advance(1000, 60, 0, 10_000)).toEqual({ steps: 60, carry: 0 })
    expect(advance(500, 60, 0, 10_000).steps).toBe(30)
  })

  it('carries the fractional remainder between frames', () => {
    const first = advance(16, 60, 0, 1000)
    expect(first.steps).toBe(0)
    expect(first.carry).toBeCloseTo(0.96, 5)
    const second = advance(16, 60, first.carry, 1000)
    expect(second.steps).toBe(1)
    expect(second.carry).toBeCloseTo(0.92, 5)
  })

  it('never returns more steps than remain', () => {
    expect(advance(10_000, 1000, 0, 7).steps).toBe(7)
  })

  it('caps the work done in a single frame', () => {
    expect(advance(100_000, 10_000_000, 0, 10_000_000).steps).toBe(MAX_STEPS_PER_FRAME)
  })

  it('does nothing at zero speed', () => {
    expect(advance(1000, 0, 0, 100)).toEqual({ steps: 0, carry: 0 })
  })
})
