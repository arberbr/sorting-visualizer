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

  it('does not leave busy wedged when its worker is torn down mid-request', async () => {
    // A worker that accepts a message but never replies — a stand-in for a
    // request whose worker gets terminated before it can answer, which is
    // exactly what happens to whatever StrictMode's first effect pass sends:
    // its cleanup terminates that worker before the second pass's worker
    // takes over.
    function silentWorker(): WorkerLike {
      return {
        postMessage() {},
        terminate() {},
        addEventListener() {},
        removeEventListener() {},
      }
    }

    // Dispatch exactly once, from an effect declared alongside useRunner so
    // it rides the same StrictMode double-invoke cycle useRunner's own
    // effect does — reproducing a request sent during the first, doomed
    // setup. The ref guard keeps this to one dispatch (not two), isolating
    // the orphaned-request case from a legitimately-still-outstanding one.
    const { result } = renderHook(
      () => {
        const runner = useRunner(() => silentWorker())
        const dispatched = React.useRef(false)
        React.useEffect(() => {
          if (dispatched.current) return
          dispatched.current = true
          void runner.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
        }, [runner.run])
        return runner
      },
      { wrapper: React.StrictMode },
    )

    // Without the fix this never resolves: the one request ever sent went to
    // the worker StrictMode's synthetic cleanup terminates, its resolver is
    // never called, and `busy` — which only clears once every pending
    // resolver is gone — stays true forever.
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  describe('watchdog', () => {
    /**
     * A worker that accepts every message and genuinely never replies — the
     * stand-in for a real Worker stuck spinning inside `new Function(...)`
     * user code that never calls a TrackedArray method (a bare
     * `while (true) {}`), so `Budget.tick()` — the only place the worker-side
     * time/step budget is enforced — is never reached.
     *
     * Tests below use a tiny real `limits.maxMillis` (the watchdog's own
     * grace period is fixed, so real elapsed time is still ~1s) rather than
     * vi.useFakeTimers(): faking timers here fights React Testing Library's
     * own act()/scheduler internals and deadlocks instead of settling.
     */
    function hangingWorker(): WorkerLike & { terminated: boolean } {
      return {
        terminated: false,
        postMessage() {},
        terminate() {
          this.terminated = true
        },
        addEventListener() {},
        removeEventListener() {},
      }
    }

    it('resolves with a timeout error when the worker never replies', async () => {
      const worker = hangingWorker()
      const { result } = renderHook(() => useRunner(() => worker))

      let out: Awaited<ReturnType<typeof result.current.run>> | undefined
      await act(async () => {
        out = await result.current.run({
          kind: 'custom',
          source: 'x',
          input: [2, 1],
          limits: { maxMillis: 20, maxSteps: 1000 },
        })
      })

      expect(out?.ok).toBe(false)
      if (out && !out.ok) {
        expect(out.error.code).toBe('timeout')
      }
      expect(worker.terminated).toBe(true)
      expect(result.current.busy).toBe(false)
    })

    it('replaces the wedged worker so a subsequent run succeeds', async () => {
      const hung = hangingWorker()
      let calls = 0
      const createWorker = () => (++calls === 1 ? hung : fakeWorker())
      const { result } = renderHook(() => useRunner(createWorker))

      await act(async () => {
        await result.current.run({
          kind: 'custom',
          source: 'x',
          input: [2, 1],
          limits: { maxMillis: 20, maxSteps: 1000 },
        })
      })

      let second: Awaited<ReturnType<typeof result.current.run>> | undefined
      await act(async () => {
        second = await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
      })
      expect(second?.ok).toBe(true)
    })

    it('does not fire the watchdog for a request that answers normally', async () => {
      const worker = fakeWorker()
      const { result } = renderHook(() => useRunner(() => worker))
      let out: Awaited<ReturnType<typeof result.current.run>> | undefined
      await act(async () => {
        out = await result.current.run({
          kind: 'builtin',
          algorithmId: 'bubble',
          input: [2, 1],
          limits: { maxMillis: 20, maxSteps: 1000 },
        })
      })
      expect(out?.ok).toBe(true)
      // Wait past what this request's watchdog window would have been; the
      // stray timer firing after an already-resolved request must be a
      // harmless no-op, not a crash or a retroactive failure.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1100))
      })
      expect(result.current.busy).toBe(false)
    })
  })
})
