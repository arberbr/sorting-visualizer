// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboard } from './useKeyboard'

const press = (key: string, target?: Element) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  ;(target ?? document.body).dispatchEvent(event)
  return event
}

const handlers = () => ({
  onToggle: vi.fn(),
  onStep: vi.fn(),
  onStart: vi.fn(),
  onEnd: vi.fn(),
})

describe('useKeyboard', () => {
  it('maps space to play/pause and arrows to stepping', () => {
    const h = handlers()
    renderHook(() => useKeyboard(h))
    press(' ')
    press('ArrowRight')
    press('ArrowLeft')
    press('Home')
    press('End')
    expect(h.onToggle).toHaveBeenCalledOnce()
    expect(h.onStep).toHaveBeenNthCalledWith(1, 1)
    expect(h.onStep).toHaveBeenNthCalledWith(2, -1)
    expect(h.onStart).toHaveBeenCalledOnce()
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('ignores keys while the user is typing', () => {
    const h = handlers()
    renderHook(() => useKeyboard(h))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press(' ', input)
    expect(h.onToggle).not.toHaveBeenCalled()
    input.remove()
  })

  it('prevents the page from scrolling on space', () => {
    renderHook(() => useKeyboard(handlers()))
    expect(press(' ').defaultPrevented).toBe(true)
  })
})
