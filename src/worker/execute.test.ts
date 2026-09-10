import { describe, it, expect } from 'vitest'
import { execute } from './execute'

describe('execute', () => {
  it('runs a built-in algorithm by id', () => {
    const r = execute({ id: 1, kind: 'builtin', algorithmId: 'heap', input: [3, 1, 2] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([1, 2, 3])
    expect(r.sorted).toBe(true)
  })

  it('reports an unknown algorithm id', () => {
    const r = execute({ id: 1, kind: 'builtin', algorithmId: 'nope', input: [1] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain('nope')
  })

  it('runs custom source', () => {
    const r = execute({
      id: 2,
      kind: 'custom',
      source: 'function sort(arr) { for (let i = 0; i < arr.length; i++) for (let j = 0; j + 1 < arr.length; j++) if (arr.compare(j, j+1) > 0) arr.swap(j, j+1) }',
      input: [5, 4, 3],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([3, 4, 5])
  })

  it('surfaces a compile failure as a run failure', () => {
    const r = execute({ id: 3, kind: 'custom', source: 'function sort( {', input: [1] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('syntax')
  })

  it('honours a caller-supplied step budget', () => {
    const r = execute({
      id: 4,
      kind: 'custom',
      source: 'function sort(arr) { for (;;) arr.get(0) }',
      input: [1, 2],
      limits: { maxSteps: 100, maxMillis: 10_000 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('step-budget')
  })
})
