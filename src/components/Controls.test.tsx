// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Controls from './Controls'

const props = () => ({
  playing: false,
  index: 10,
  total: 100,
  speed: 100,
  disabled: false,
  onToggle: vi.fn(),
  onStep: vi.fn(),
  onSeek: vi.fn(),
  onSpeed: vi.fn(),
})

describe('Controls', () => {
  it('toggles playback', async () => {
    const p = props()
    render(<Controls {...p} />)
    await userEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(p.onToggle).toHaveBeenCalledOnce()
  })

  it('labels the button pause while playing', () => {
    render(<Controls {...props()} playing />)
    expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy()
  })

  it('steps forward and backward by one', async () => {
    const p = props()
    render(<Controls {...p} />)
    await userEvent.click(screen.getByRole('button', { name: /step forward/i }))
    await userEvent.click(screen.getByRole('button', { name: /step back/i }))
    expect(p.onStep).toHaveBeenNthCalledWith(1, 1)
    expect(p.onStep).toHaveBeenNthCalledWith(2, -1)
  })

  it('shows the step position', () => {
    render(<Controls {...props()} />)
    expect(screen.getByTestId('position').textContent).toBe('10 / 100')
  })

  it('disables everything when there is no trace', () => {
    render(<Controls {...props()} disabled />)
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
