import { describe, expect, it, vi } from 'vitest'
import { getAlgorithm } from '../algorithms'
import { generate } from '../core/generate'
import { runSort } from '../core/runner'
import { PlayerEngine } from './engine'

const trace = () => {
  const algo = getAlgorithm('insertion')!
  const r = runSort(algo.sort, generate(24, 'random', 4))
  if (!r.ok) throw new Error('setup failed')
  return r.trace
}

describe('PlayerEngine', () => {
  it('starts at step 0 showing the input', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    expect(e.index).toBe(0)
    expect(Array.from(e.frame.main)).toEqual(t.input)
  })

  it('steps forward and backward to the same state', () => {
    const e = new PlayerEngine(trace())
    e.stepBy(50)
    const forward = Array.from(e.frame.main)
    e.stepBy(10)
    e.stepBy(-10)
    expect(Array.from(e.frame.main)).toEqual(forward)
  })

  it('clamps at both ends', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.stepBy(-5)
    expect(e.index).toBe(0)
    e.seek(t.steps.length + 1000)
    expect(e.index).toBe(t.steps.length)
    expect(e.atEnd).toBe(true)
  })

  it('ends on the fully sorted array', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.seek(t.steps.length)
    expect(Array.from(e.frame.main)).toEqual([...t.input].sort((a, b) => a - b))
  })

  it('tick advances by elapsed time and stops at the end', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.tick(1000, 10)
    expect(e.index).toBe(10)
    e.tick(1_000_000, 1_000_000)
    expect(e.index).toBe(t.steps.length)
  })

  it('notifies subscribers when the frame changes, and stops after unsubscribe', () => {
    const e = new PlayerEngine(trace())
    const seen = vi.fn()
    const off = e.onFrame(seen)
    e.stepBy(5)
    expect(seen).toHaveBeenCalledTimes(1)
    off()
    e.stepBy(5)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
