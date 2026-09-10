// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRunner, type WorkerLike } from './useRunner'
import { execute } from './execute'
import type { RunRequest, RunResponse } from './protocol'

/** A synchronous stand-in for the real Worker, so the hook is testable in jsdom. */
function fakeWorker(): WorkerLike & { sent: RunRequest[] } {
  const listeners = new Set<(e: { data: RunResponse }) => void>()
  const sent: RunRequest[] = []
  return {
    sent,
    postMessage(m: unknown) {
      const req = m as RunRequest
      sent.push(req)
      const response: RunResponse = { id: req.id, result: execute(req) }
      for (const l of listeners) l({ data: response })
    },
    terminate() {},
    addEventListener(_t, l) {
      listeners.add(l)
    },
    removeEventListener(_t, l) {
      listeners.delete(l)
    },
  }
}

describe('useRunner', () => {
  it('resolves with the run result', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))

    let out: Awaited<ReturnType<typeof result.current.run>> | undefined
    await act(async () => {
      out = await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
    })

    expect(out?.ok).toBe(true)
    if (out?.ok) expect(out.finalArray).toEqual([1, 2])
  })

  it('gives each request a distinct id', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))
    await act(async () => {
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [3, 1] })
    })
    expect(worker.sent[0].id).not.toBe(worker.sent[1].id)
  })

  it('reports busy while a run is outstanding', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))
    expect(result.current.busy).toBe(false)
    await act(async () => {
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
    })
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it('survives StrictMode\'s dev-only mount -> cleanup -> mount cycle', async () => {
    // StrictMode double-invokes effects on mount (setup, cleanup, setup again)
    // without an intervening render, so the effect must be able to recreate
    // the worker itself rather than relying on the render-time guard alone.
    const created: Array<ReturnType<typeof fakeWorker>> = []
    const createWorker = () => {
      const w = fakeWorker()
      created.push(w)
      return w
    }
    const { result } = renderHook(() => useRunner(createWorker), {
      wrapper: React.StrictMode,
    })

    let out: Awaited<ReturnType<typeof result.current.run>> | undefined
    await act(async () => {
      out = await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
    })

    expect(out?.ok).toBe(true)
    // The worker that is still listening must be the one the request went to.
    const live = created[created.length - 1]
    expect(live.sent).toHaveLength(1)
  })
})
