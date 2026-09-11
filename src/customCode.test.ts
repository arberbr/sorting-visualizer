// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SOURCE, DRAFT_KEY, loadDraft, saveDraft } from './customCode'

describe('draft persistence', () => {
  beforeEach(() => localStorage.clear())

  it('returns the default source when nothing is stored', () => {
    expect(loadDraft()).toBe(DEFAULT_SOURCE)
  })

  it('round-trips a saved draft', () => {
    saveDraft('function sort(arr) {}')
    expect(loadDraft()).toBe('function sort(arr) {}')
    expect(localStorage.getItem(DRAFT_KEY)).toBe('function sort(arr) {}')
  })

  it('falls back to the default when storage throws', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    expect(loadDraft()).toBe(DEFAULT_SOURCE)
    Storage.prototype.getItem = original
  })
})

describe('DEFAULT_SOURCE', () => {
  it('defines a sort function and mentions the API', () => {
    expect(DEFAULT_SOURCE).toContain('function sort(arr)')
    expect(DEFAULT_SOURCE).toContain('arr.compare')
    expect(DEFAULT_SOURCE).toContain('arr.swap')
  })
})
