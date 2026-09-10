import { describe, it, expect } from 'vitest'
import { RENDERERS, getRenderer } from './index'
import { createInitialState } from '../core/frame'
import { DARK } from './theme'

/** A minimal 2D context recorder — enough to prove a renderer draws without a browser. */
function fakeCtx() {
  const calls: string[] = []
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === 'calls') return calls
      if (prop === 'canvas') return { width: 800, height: 400 }
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.length})`)
      }
    },
    set() {
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D & { calls: string[] }
}

describe('renderer registry', () => {
  it('registers all four styles', () => {
    expect(RENDERERS.map((r) => r.id)).toEqual(['bars', 'dots', 'rainbow', 'pyramid'])
  })

  it('falls back to bars for an unknown id', () => {
    expect(getRenderer('nope' as never)).toBe(RENDERERS[0].draw)
  })

  it.each(RENDERERS.map((r) => [r.id, r.draw] as const))('%s draws something', (_id, draw) => {
    const ctx = fakeCtx()
    const frame = createInitialState([3, 1, 4, 1, 5, 9, 2, 6], 0)
    draw(ctx, frame, DARK, { width: 800, height: 400 })
    expect((ctx as unknown as { calls: string[] }).calls.length).toBeGreaterThan(0)
  })

  it.each(RENDERERS.map((r) => [r.id, r.draw] as const))(
    '%s survives an empty array',
    (_id, draw) => {
      const ctx = fakeCtx()
      const frame = createInitialState([], 0)
      expect(() => draw(ctx, frame, DARK, { width: 800, height: 400 })).not.toThrow()
    },
  )
})
