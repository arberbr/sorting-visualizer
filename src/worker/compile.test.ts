import { describe, expect, it } from 'vitest'
import { runSort } from '../core/runner'
import { compileCustom } from './compile'

describe('compileCustom', () => {
  it('compiles a function named sort and it actually sorts', () => {
    const c = compileCustom(`
function sort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i
    while (j > 0 && arr.compare(j - 1, j) > 0) { arr.swap(j - 1, j); j-- }
  }
}`)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    const r = runSort(c.fn, [3, 1, 2])
    expect(r.ok && r.finalArray).toEqual([1, 2, 3])
  })

  it('accepts a const arrow function assigned to sort', () => {
    const c = compileCustom('const sort = (arr) => { arr.swap(0, 1) }')
    expect(c.ok).toBe(true)
  })

  it('reports a syntax error', () => {
    const c = compileCustom('function sort(arr) { if ( }')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('syntax')
    expect(c.error.message.length).toBeGreaterThan(0)
  })

  it('reports not-a-function when sort is missing', () => {
    const c = compileCustom('const helper = 1')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('not-a-function')
    expect(c.error.message).toContain('sort')
  })

  it('reports a runtime error thrown at module level', () => {
    const c = compileCustom('throw new Error("top level boom")\nfunction sort() {}')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('runtime')
    expect(c.error.message).toContain('top level boom')
  })

  it('pins the current best-effort line for a syntax error on this engine', () => {
    const c = compileCustom('function sort(arr) { if ( }')
    expect(c.ok).toBe(false)
    if (c.ok) return
    // On V8, a SyntaxError thrown by the Function constructor carries no
    // `<anonymous>:N:M` position in its stack — just `at new Function
    // (<anonymous>)` — so there is nothing to extract or correct. `line`
    // stays undefined rather than a guess. If this ever starts returning a
    // number, WRAPPER_LINE_OFFSET is already applied to it — update this test.
    expect(c.error.line).toBeUndefined()
  })
})
