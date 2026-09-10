// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Telemetry, { formatCount } from './Telemetry'
import { getAlgorithm } from '../algorithms'

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1234)).toBe('1,234')
    expect(formatCount(1_234_567)).toBe('1,234,567')
  })
})

describe('Telemetry', () => {
  const counts = { reads: 5, writes: 6, compares: 1234, swaps: 8 }

  it('shows every counter', () => {
    render(
      <Telemetry
        counts={counts}
        index={10}
        total={100}
        sorted
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('count-compares').textContent).toBe('1,234')
    expect(screen.getByTestId('count-swaps').textContent).toBe('8')
    expect(screen.getByTestId('count-reads').textContent).toBe('5')
    expect(screen.getByTestId('count-writes').textContent).toBe('6')
  })

  it('shows the algorithm complexity and stability', () => {
    render(
      <Telemetry counts={counts} index={0} total={1} sorted algorithm={getAlgorithm('heap')!} />,
    )
    expect(screen.getByTestId('complexity-average').textContent).toContain('O(n log n)')
    expect(screen.getByText(/unstable/i)).toBeTruthy()
  })

  it('reports the correctness verdict', () => {
    const { rerender } = render(
      <Telemetry counts={counts} index={1} total={1} sorted algorithm={getAlgorithm('bubble')!} />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/sorted/i)
    rerender(
      <Telemetry
        counts={counts}
        index={1}
        total={1}
        sorted={false}
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/not sorted/i)
  })
})
