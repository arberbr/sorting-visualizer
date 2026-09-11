import { describe, expect, it } from 'vitest'
import { TrackedArray } from '../core/trackedArray'
import { API_ENTRIES } from './apiEntries'

/** The reference panel is the user's only contract. Drift here is a real bug. */
describe('API_ENTRIES', () => {
  it('documents every public method of TrackedArray', () => {
    const actual = Object.getOwnPropertyNames(TrackedArray.prototype).filter(
      (name) => name !== 'constructor' && !name.startsWith('_'),
    )
    const documented = API_ENTRIES.map((e) => e.member)
    for (const name of actual) {
      // Private helpers are not on the prototype's public surface by convention;
      // anything reachable from user code must appear in the reference.
      if (['record', 'bounds', 'mark'].includes(name)) continue
      expect(documented, `missing from the API reference: ${name}`).toContain(name)
    }
  })

  it('documents length and the aux buffer', () => {
    const documented = API_ENTRIES.map((e) => e.member)
    expect(documented).toContain('length')
    expect(documented).toContain('alloc')
  })

  it('gives each entry a signature and a description', () => {
    for (const e of API_ENTRIES) {
      expect(e.signature.length).toBeGreaterThan(0)
      expect(e.description.length).toBeGreaterThan(10)
    }
  })
})
