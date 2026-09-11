// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBanner from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorBanner error={null} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains a step-budget failure as a likely infinite loop', () => {
    render(
      <ErrorBanner
        error={{ code: 'step-budget', message: 'Exceeded the 2000000 step limit', limit: 2_000_000 }}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/infinite loop/i)
  })

  it('shows the line number when there is one', () => {
    render(
      <ErrorBanner
        error={{ code: 'runtime', message: 'x is not defined', line: 7 }}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('line 7')
    expect(screen.getByRole('alert').textContent).toContain('x is not defined')
  })

  it('can be dismissed', async () => {
    const onDismiss = vi.fn()
    render(<ErrorBanner error={{ code: 'syntax', message: 'bad' }} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
