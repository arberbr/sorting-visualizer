import { describe, expect, it } from 'vitest'
import { Budget, LimitError } from './limits'

describe('Budget', () => {
  it('allows exactly maxSteps ticks', () => {
    const b = new Budget({ maxSteps: 3, maxMillis: 1000 })
    b.tick()
    b.tick()
    b.tick()
    expect(() => b.tick()).toThrow(LimitError)
  })

  it('reports step-budget as the failure kind', () => {
    const b = new Budget({ maxSteps: 1, maxMillis: 1000 })
    b.tick()
    try {
      b.tick()
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(LimitError)
      expect((e as LimitError).kind).toBe('step-budget')
      expect((e as LimitError).limit).toBe(1)
    }
  })

  it('throws timeout once the clock passes the deadline', () => {
    let now = 0
    const b = new Budget({ maxSteps: 1_000_000, maxMillis: 50 }, () => now)
    // The clock is only sampled every 4096 ticks, so advance time then tick past a boundary.
    now = 1000
    expect(() => {
      for (let i = 0; i < 8192; i++) b.tick()
    }).toThrowError(/50ms/)
  })
})
