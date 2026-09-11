import { describe, expect, it } from 'vitest'
import { extractSortSource } from './source'

const raw = `import type { TrackedArray } from '../../core/trackedArray'

export const meta = { id: 'x' }

export function sort(a: TrackedArray): void {
  a.swap(0, 1)
}
`

describe('extractSortSource', () => {
  it('returns only the sort function, without the export keyword', () => {
    expect(extractSortSource(raw)).toBe('function sort(a: TrackedArray): void {\n  a.swap(0, 1)\n}')
  })

  it('returns the whole input when there is no sort function', () => {
    expect(extractSortSource('const x = 1\n')).toBe('const x = 1')
  })
})
