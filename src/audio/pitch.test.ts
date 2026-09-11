import { describe, it, expect } from 'vitest'
import { MAX_HZ, MIN_HZ, pitchFor } from './pitch'

describe('pitchFor', () => {
  it('maps the value range onto the audible band', () => {
    expect(pitchFor(0, 100)).toBeCloseTo(MIN_HZ, 5)
    expect(pitchFor(100, 100)).toBeCloseTo(MAX_HZ, 5)
  })

  it('rises monotonically with value', () => {
    expect(pitchFor(50, 100)).toBeGreaterThan(pitchFor(20, 100))
  })

  it('spans roughly two octaves', () => {
    expect(MAX_HZ / MIN_HZ).toBeGreaterThan(3.5)
    expect(MAX_HZ / MIN_HZ).toBeLessThan(4.5)
  })

  it('clamps out-of-range values instead of going inaudible', () => {
    expect(pitchFor(-10, 100)).toBe(MIN_HZ)
    expect(pitchFor(999, 100)).toBe(MAX_HZ)
  })

  it('survives a zero maximum', () => {
    expect(pitchFor(0, 0)).toBe(MIN_HZ)
  })
})
