import { describe, it, expect } from 'vitest'
import { toPlainJs } from '../algorithms/toPlainJs'
import { ALGORITHMS, getAlgorithm } from '../algorithms'
import { compileCustom } from '../worker/compile'
import { runSort } from '../core/runner'

/**
 * `toPlainJs` strips TypeScript so a built-in's source can be loaded into the
 * custom-code editor and run as-is. It is a regex-based, structural stripper
 * (not a real parser), so it is exercised here against several genuinely
 * different built-ins — not just one — through the exact same compile path
 * the worker uses for user code (`compileCustom` + `runSort`).
 */
describe('toPlainJs', () => {
  const check = (id: string, input: number[]) => {
    const algo = getAlgorithm(id)!
    const plain = toPlainJs(algo.source)
    const compiled = compileCustom(plain)
    expect(compiled.ok, compiled.ok ? '' : compiled.error.message).toBe(true)
    if (!compiled.ok) return
    const result = runSort(compiled.fn, input)
    expect(result.ok, result.ok ? '' : result.error.message).toBe(true)
    if (!result.ok) return
    expect(result.finalArray).toEqual([...input].sort((a, b) => a - b))
    expect(result.sorted).toBe(true)
  }

  const input = [37, 12, 89, 4, 56, 23, 78, 1, 90, 45, 6, 66, 15, 3, 99, 21]

  it('a simple algorithm: insertion sort', () => {
    check('insertion', input)
  })

  it('an algorithm with an aux buffer: merge sort (top-down)', () => {
    // Also the case that exposes the brief's original regex: `merge`'s inner
    // closure takes three typed params, `(lo: number, mid: number, hi: number)`,
    // and a literal-enumeration regex only ever strips the first and last.
    check('merge-top-down', input)
  })

  it('an algorithm with an aux buffer: merge sort (bottom-up)', () => {
    check('merge-bottom-up', input)
  })

  it('an algorithm with nested closures: pancake sort', () => {
    check('pancake', input)
  })

  it('an algorithm with nested closures: heapsort', () => {
    check('heap', input)
  })

  it('an algorithm with a locally-defined type and an `as` cast: tree sort', () => {
    // `interface Node` lives above the `sort` marker so extractSortSource never
    // includes it, but the body still declares `let root: Node | null` and
    // `stack.pop() as Node` — neither is `number`/`string`/`boolean`/
    // `TrackedArray`, so a type-name allowlist can't cover this; toPlainJs
    // strips it structurally instead (by position, not by type name).
    check('tree', input)
  })

  it('an algorithm with a generic type argument: radix sort (LSD)', () => {
    // `new Array<number>(10)` — TS generic syntax, a different construct from
    // a type annotation. Left unhandled, `Array<number>(10)` parses as valid
    // but wrong JS (chained comparisons), throwing "number is not defined"
    // instead of failing to compile.
    check('radix-lsd', [7, 3, 9, 1, 5, 2, 8, 4, 6, 10, 0, 20, 15])
  })

  it('converts every built-in to code that at least compiles', () => {
    for (const algo of ALGORITHMS) {
      const compiled = compileCustom(toPlainJs(algo.source))
      expect(compiled.ok, `${algo.meta.id}: ${compiled.ok ? '' : compiled.error.message}`).toBe(
        true,
      )
    }
  })

  // Regression coverage for a real bug: timsort, introsort and shell each
  // declared a module-level `const` (RUN / SMALL / GAPS) *above*
  // `export function sort`, so extractSortSource never captured it and the
  // extracted source threw a ReferenceError the moment it ran. Fixed by
  // nesting each constant inside its own `sort` function (the same pattern
  // pancake.ts already used for its `flip` closure) rather than by changing
  // extractSortSource, which has its own contract test to stay simple.
  it.each(['timsort', 'introsort', 'shell'])(
    'loading %s as a starting point produces code that actually sorts',
    (id) => {
      check(id, input)
    },
  )
})
