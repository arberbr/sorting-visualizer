import { describe, it, expect } from 'vitest'
import { compileCustom } from './compile'
import { runSort } from '../core/runner'

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
})
