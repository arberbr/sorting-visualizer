// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getAlgorithm } from '../algorithms'
import Telemetry, { formatCount, verdictLabel } from './Telemetry'

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1234)).toBe('1,234')
    expect(formatCount(1_234_567)).toBe('1,234,567')
  })
})

describe('verdictLabel', () => {
  it('reports nothing at all until a run has answered', () => {
    expect(verdictLabel(null)).toBe('no result yet')
  })

  it('names the first wrong index when the result is not the sorted input', () => {
    expect(verdictLabel({ sorted: false, firstUnsorted: 37 })).toBe(
      'not sorted · first wrong at 37',
    )
  })

  it('falls back to a bare verdict when there is no index to point at', () => {
    expect(verdictLabel({ sorted: false, firstUnsorted: -1 })).toBe('not sorted')
    expect(verdictLabel({ sorted: true, firstUnsorted: -1 })).toBe('sorted')
  })
})

describe('Telemetry', () => {
  const counts = { reads: 5, writes: 6, compares: 1234, swaps: 8 }
  const ok = { sorted: true, firstUnsorted: -1 }

  it('shows every counter', () => {
    render(
      <Telemetry
        counts={counts}
        index={10}
        total={100}
        verdict={ok}
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
      <Telemetry
        counts={counts}
        index={0}
        total={1}
        verdict={ok}
        algorithm={getAlgorithm('heap')!}
      />,
    )
    expect(screen.getByTestId('complexity-average').textContent).toContain('O(n log n)')
    expect(screen.getByText(/unstable/i)).toBeTruthy()
  })

  it('reports the correctness verdict', () => {
    const { rerender } = render(
      <Telemetry
        counts={counts}
        index={1}
        total={1}
        verdict={ok}
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/sorted/i)
    expect(screen.getByTestId('verdict').className).toContain('chip--ok')
    rerender(
      <Telemetry
        counts={counts}
        index={1}
        total={1}
        verdict={{ sorted: false, firstUnsorted: 12 }}
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/not sorted/i)
    // The index is computed, cloned across the worker boundary, and was
    // previously read by nobody.
    expect(screen.getByTestId('verdict').textContent).toContain('12')
    expect(screen.getByTestId('verdict').className).toContain('chip--bad')
  })

  it('claims no verdict before a run has reported one', () => {
    render(
      <Telemetry
        counts={counts}
        index={0}
        total={0}
        verdict={null}
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    const chip = screen.getByTestId('verdict')
    expect(chip.textContent).toBe('no result yet')
    expect(chip.className).not.toContain('chip--ok')
    expect(chip.className).not.toContain('chip--bad')
  })
})
