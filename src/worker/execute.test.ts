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

  it('reports the exact line a multi-line custom sort throws on', () => {
    const source = [
      'function sort(arr) {',
      '  const x = 1',
      '  const y = 2',
      "  throw new Error('boom')",
      '}',
    ].join('\n')
    const r = execute({ id: 5, kind: 'custom', source, input: [1, 2] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // Four lines make an off-by-two unmistakable: a naive raw report would be 6.
    expect(r.error.line).toBe(4)
  })

  it('reports line 1, never 0 or negative, when the first line throws', () => {
    const r = execute({
      id: 6,
      kind: 'custom',
      source: "function sort(arr) { throw new Error('boom') }",
      input: [1, 2],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.line).toBe(1)
  })

  it("leaves a built-in run's error untouched by the wrapper-offset correction", () => {
    const r = execute({ id: 7, kind: 'builtin', algorithmId: 'nope', input: [1] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    // Built-ins are never dynamically compiled, so there is never a wrapper
    // line to correct for — this must stay undefined, not a shifted number.
    expect(r.error.line).toBeUndefined()
  })
})
