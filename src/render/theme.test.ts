// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { DARK, applyTheme, cssVarName } from './theme'

describe('theme', () => {
  it('names variables predictably', () => {
    expect(cssVarName('bg')).toBe('--c-bg')
    expect(cssVarName('surfaceAlt')).toBe('--c-surface-alt')
  })

  it('writes every palette entry onto the root element', () => {
    const root = document.createElement('div')
    applyTheme(DARK, root)
    for (const key of Object.keys(DARK) as Array<keyof typeof DARK>) {
      expect(root.style.getPropertyValue(cssVarName(key))).toBe(DARK[key])
    }
  })

  it('uses the specified ground color', () => {
    expect(DARK.bg).toBe('#0a0b0f')
  })

  it('gives every semantic role a distinct color', () => {
    const roles = [DARK.idle, DARK.read, DARK.compare, DARK.swap, DARK.pivot, DARK.sorted, DARK.aux]
    expect(new Set(roles).size).toBe(roles.length)
  })
})
