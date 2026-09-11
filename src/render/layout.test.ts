import { describe, it, expect } from 'vitest'
import { applyStep, createInitialState } from '../core/frame'
import { barMetrics, DECAY_STEPS, elementColor, heat, splitLanes } from './layout'
import { DARK } from './theme'

describe('splitLanes', () => {
  it('gives the whole area to the main lane when there is no aux buffer', () => {
    const { main, aux } = splitLanes({ width: 800, height: 400 }, false)
    expect(aux).toBeNull()
    expect(main.h).toBeGreaterThan(350)
    expect(main.w).toBeLessThanOrEqual(800)
  })

  it('reserves a strip below for the aux buffer', () => {
    const { main, aux } = splitLanes({ width: 800, height: 400 }, true)
    expect(aux).not.toBeNull()
    expect(aux!.y).toBeGreaterThan(main.y + main.h - 1)
    expect(aux!.h).toBeLessThan(main.h)
  })
})

describe('barMetrics', () => {
  it('fills the width without overflowing', () => {
    const area = { x: 0, y: 0, w: 1000, h: 100 }
    const m = barMetrics(area, 50)
    expect(m.slot * 50).toBeLessThanOrEqual(1000 + 0.001)
    expect(m.barWidth).toBeGreaterThan(0)
    expect(m.barWidth).toBeLessThanOrEqual(m.slot)
  })

  it('drops the gap entirely when bars get thin', () => {
    const area = { x: 0, y: 0, w: 300, h: 100 }
    expect(barMetrics(area, 1000).gap).toBe(0)
  })

  it('never returns a sub-pixel bar width', () => {
    const area = { x: 0, y: 0, w: 100, h: 100 }
    expect(barMetrics(area, 1000).barWidth).toBeGreaterThanOrEqual(1)
  })
})

describe('heat', () => {
  it('is 1 at the moment of the touch and 0 once decayed', () => {
    expect(heat(100, 100)).toBe(1)
    expect(heat(100 + DECAY_STEPS, 100)).toBe(0)
    expect(heat(100, -1_000_000)).toBe(0)
  })

  it('falls off monotonically', () => {
    const a = heat(105, 100)
    const b = heat(110, 100)
    expect(a).toBeGreaterThan(b)
  })

  it('never goes negative or above 1', () => {
    expect(heat(50, 100)).toBeLessThanOrEqual(1)
    expect(heat(10_000, 100)).toBe(0)
  })
})

describe('elementColor', () => {
  const after = (step: Parameters<typeof applyStep>[1]) => {
    const s = createInitialState([3, 1, 2], 0)
    applyStep(s, step)
    return s
  }

  it('keeps a plain read out of the compare colour', () => {
    const read = elementColor(1, after({ t: 'read', lane: 0, i: 1 }), DARK)
    const compared = elementColor(1, after({ t: 'compare', lane: 0, i: 1, j: 2, result: 1 }), DARK)
    expect(read).not.toBe(compared)
  })

  it('still shows a read as activity rather than idle', () => {
    const s = after({ t: 'read', lane: 0, i: 1 })
    expect(elementColor(1, s, DARK)).not.toBe(elementColor(0, s, DARK))
    expect(elementColor(0, s, DARK)).toBe(DARK.idle)
  })

  it('lets a read decay back to idle like every other channel', () => {
    const s = after({ t: 'read', lane: 0, i: 1 })
    s.index += DECAY_STEPS
    expect(elementColor(1, s, DARK)).toBe(DARK.idle)
  })

  it('still prefers a write and a compare over a read on the same element', () => {
    const s = after({ t: 'read', lane: 0, i: 1 })
    applyStep(s, { t: 'compare', lane: 0, i: 1, j: 2, result: 1 })
    const compared = elementColor(1, s, DARK)
    applyStep(s, { t: 'write', lane: 0, i: 1, value: 4 })
    expect(elementColor(1, s, DARK)).not.toBe(compared)
  })
})
