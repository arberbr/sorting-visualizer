import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LIMITS } from '../core/limits'
import type { RunResult } from '../core/runner'
import type { RunRequest, RunResponse } from './protocol'

/**
 * `Omit` alone collapses a discriminated union to its common keys, which would
 * drop `algorithmId`/`source` from `RunRequest`'s branches. Distributing over
 * the union before omitting keeps each branch intact.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export interface WorkerLike {
  postMessage(m: unknown): void
  terminate(): void
  addEventListener(type: 'message', listener: (e: { data: RunResponse }) => void): void
  removeEventListener(type: 'message', listener: (e: { data: RunResponse }) => void): void
}

const defaultFactory = (): WorkerLike =>
  new Worker(new URL('./sortRunner.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike

/**
 * A request still unanswered this long after the worker's own budget should
 * have caught it is presumed wedged, not just slow — see `reapWedgedWorker`.
 */
const WATCHDOG_GRACE_MS = 1000

interface PendingEntry {
  resolve: (r: RunResult) => void
  timer: ReturnType<typeof setTimeout>
}

/** Owns the worker and matches responses to requests by id. */
export function useRunner(createWorker: () => WorkerLike = defaultFactory) {
  const workerRef = useRef<WorkerLike | null>(null)
  const nextId = useRef(1)
  const pending = useRef(new Map<number, PendingEntry>())
  const [busy, setBusy] = useState(false)

  // Stable across the worker's whole lifetime (and every replacement — see
  // reapWedgedWorker) since it only ever touches `pending`, a ref.
  const onMessageRef = useRef<(e: { data: RunResponse }) => void>(undefined)
  if (!onMessageRef.current) {
    onMessageRef.current = (e) => {
      const entry = pending.current.get(e.data.id)
      if (!entry) return // a stale response from a superseded run
      clearTimeout(entry.timer)
      pending.current.delete(e.data.id)
      entry.resolve(e.data.result)
      if (pending.current.size === 0) setBusy(false)
    }
  }

  const attachWorker = useCallback(() => {
    const worker = createWorker()
    worker.addEventListener('message', onMessageRef.current!)
    workerRef.current = worker
  }, [createWorker])

  if (workerRef.current === null) attachWorker()

  /**
   * A sort function with zero recorded operations — a bare `while (true) {}`
   * being the obvious case — never calls `Budget.tick()`, since that only
   * runs from inside `TrackedArray`'s own methods. The worker-side timeout
   * check lives entirely inside `tick()`, so code like that trips neither
   * the step budget nor the time budget: it just spins forever, and the
   * worker never replies. This is the backstop for exactly that case — a
   * request still unanswered `limit + grace` after it was sent is treated as
   * a wedged worker: it gets replaced outright (never left running in the
   * background), and every request still waiting on it — normally just the
   * one, but an overlapping debounced dispatch could leave more — resolves
   * with a timeout RunError instead of hanging forever.
   */
  const reapWedgedWorker = useCallback(
    (limit: number) => {
      workerRef.current?.removeEventListener('message', onMessageRef.current!)
      workerRef.current?.terminate()
      attachWorker()
      const stuck = Array.from(pending.current.values())
      pending.current.clear()
      setBusy(false)
      for (const entry of stuck) {
        clearTimeout(entry.timer)
        entry.resolve({
          ok: false,
          error: {
            code: 'timeout',
            message: `Exceeded the ${limit}ms time limit (the worker stopped responding)`,
            limit,
          },
        })
      }
    },
    [attachWorker],
  )

  useEffect(() => {
    // StrictMode double-invokes effects on mount in development (setup,
    // cleanup, setup again) with no render in between, so the cleanup below
    // can null the ref before this setup runs a second time. Recreate the
    // worker here too rather than assuming the render-time guard above
    // already did it.
    if (workerRef.current === null) attachWorker()
    return () => {
      // Reads workerRef.current live, not a worker captured at effect-setup
      // time: reapWedgedWorker can have swapped it out since this effect ran,
      // and it's whichever worker is actually live that must be torn down.
      workerRef.current?.removeEventListener('message', onMessageRef.current!)
      workerRef.current?.terminate()
      workerRef.current = null
      // A terminated worker can never answer whatever requests are still
      // outstanding — their resolvers would otherwise sit in `pending`
      // forever, permanently wedging `busy` true. This fires on every real
      // unmount too (harmless — nothing is left to observe it) and, in
      // development, on StrictMode's synthetic cleanup between its two
      // mount passes, which is the case that actually matters: a request
      // dispatched during the first pass is always sent to a worker that's
      // about to be replaced, and would otherwise never resolve.
      for (const entry of pending.current.values()) clearTimeout(entry.timer)
      pending.current.clear()
      setBusy(false)
    }
  }, [attachWorker])

  const run = useCallback(
    (req: DistributiveOmit<RunRequest, 'id'>): Promise<RunResult> => {
      const id = nextId.current++
      const limit = req.limits?.maxMillis ?? DEFAULT_LIMITS.maxMillis
      setBusy(true)
      return new Promise<RunResult>((resolve) => {
        const timer = setTimeout(() => {
          if (pending.current.has(id)) reapWedgedWorker(limit)
        }, limit + WATCHDOG_GRACE_MS)
        pending.current.set(id, { resolve, timer })
        workerRef.current!.postMessage({ ...req, id } as RunRequest)
      })
    },
    [reapWedgedWorker],
  )

  return { run, busy }
}
