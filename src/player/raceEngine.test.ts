import { describe, it, expect } from 'vitest'
import { RaceEngine } from './raceEngine'
import { PlayerEngine } from './engine'
import { runSort } from '../core/runner'
import { getAlgorithm } from '../algorithms'
import { generate } from '../core/generate'

const laneFor = (id: string, input: number[]) => {
  const r = runSort(getAlgorithm(id)!.sort, input)
  if (!r.ok) throw new Error('setup failed')
  return { id, label: id, engine: new PlayerEngine(r.trace) }
}

const race = () => {
  const input = generate(32, 'random', 11)
  return new RaceEngine([laneFor('bubble', input), laneFor('heap', input)])
}

describe('RaceEngine', () => {
  it('total is the longest lane', () => {
    const r = race()
    expect(r.total).toBe(Math.max(...r.lanes.map((l) => l.engine.total)))
  })

  it('advances every lane together', () => {
    const r = race()
    r.seek(20)
    expect(r.index).toBe(20)
    for (const lane of r.lanes) expect(lane.engine.index).toBe(Math.min(20, lane.engine.total))
  })

  it('holds a finished lane at its end while others continue', () => {
    const r = race()
    const short = r.lanes.reduce((a, b) => (a.engine.total <= b.engine.total ? a : b))
    r.seek(r.total)
    expect(short.engine.index).toBe(short.engine.total)
    expect(r.finished).toBe(true)
  })

  it('every lane ends sorted', () => {
    const r = race()
    r.seek(r.total)
    for (const lane of r.lanes) {
      const values = Array.from(lane.engine.frame.main)
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
  })

  it('ticking is equivalent to seeking the same distance', () => {
    const a = race()
    const b = race()
    a.tick(1000, 50)
    b.seek(50)
    expect(a.index).toBe(b.index)
  })
})
