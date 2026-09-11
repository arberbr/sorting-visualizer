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

/**
 * What a dispatch resolves to. `null` means "cancelled" — the request was
 * superseded by a later dispatch (or the hook unmounted) and its worker was
 * torn down before it could answer, so there is no result and no failure to
 * report. Callers ignore it. Deliberately *not* a sixth `RunError` code: the
 * five codes are switched over exhaustively elsewhere, and a cancellation is
 * not an error the user should ever be shown.
 */
export type RunOutcome = RunResult | null

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
  resolve: (r: RunOutcome) => void
  /** This request's own time budget, for its watchdog window and its message. */
  limit: number
  timer: ReturnType<typeof setTimeout>
}

/** Owns the worker and matches responses to requests by id. */
export function useRunner(createWorker: () => WorkerLike = defaultFactory) {
  const workerRef = useRef<WorkerLike | null>(null)
  const nextId = useRef(1)
  const pending = useRef(new Map<number, PendingEntry>())
  const [busy, setBusy] = useState(false)

  // The factory lives in a ref so every callback below can have an empty
  // dependency list: a caller passing an inline `() => new FakeWorker()`
  // would otherwise change `attachWorker`'s identity on every render and
  // take the worker down with it.
  const factoryRef = useRef(createWorker)
  factoryRef.current = createWorker

  // Stable across the worker's whole lifetime (and every replacement — see
  // reapWedgedWorker) since it only ever touches refs.
  const onMessageRef = useRef<(e: { data: RunResponse }) => void>(undefined)

  const attachWorker = useCallback(() => {
    const worker = factoryRef.current()
    worker.addEventListener('message', onMessageRef.current!)
    workerRef.current = worker
  }, [])

  /** Drops the live worker outright and puts a fresh one in its place. */
  const replaceWorker = useCallback(() => {
    workerRef.current?.removeEventListener('message', onMessageRef.current!)
    workerRef.current?.terminate()
    attachWorker()
  }, [attachWorker])

  /**
   * A sort function with zero recorded operations — a bare `while (true) {}`
   * being the obvious case — never calls `Budget.tick()`, since that only
   * runs from inside `TrackedArray`'s own methods. The worker-side timeout
   * check lives entirely inside `tick()`, so code like that trips neither
   * the step budget nor the time budget: it just spins forever, and the
   * worker never replies. This is the backstop for exactly that case — a
   * request still unanswered `limit + grace` after the worker last showed
   * any sign of life is treated as a wedged worker: it gets replaced
   * outright (never left running in the background), and every request
   * still waiting on it — normally just the one, but a race dispatches a
   * whole batch at once — resolves with a timeout RunError quoting *its
   * own* limit, instead of hanging forever.
   */
  const reapWedgedWorker = useCallback(() => {
    replaceWorker()
    const stuck = Array.from(pending.current.values())
    pending.current.clear()
    setBusy(false)
    for (const entry of stuck) {
      clearTimeout(entry.timer)
      entry.resolve({
        ok: false,
        error: {
          code: 'timeout',
          message: `Exceeded the ${entry.limit}ms time limit (the worker stopped responding)`,
          limit: entry.limit,
        },
      })
    }
  }, [replaceWorker])

  const arm = useCallback(
    (id: number, limit: number) =>
      setTimeout(() => {
        if (pending.current.has(id)) reapWedgedWorker()
      }, limit + WATCHDOG_GRACE_MS),
    [reapWedgedWorker],
  )

  if (!onMessageRef.current) {
    onMessageRef.current = (e) => {
      const entry = pending.current.get(e.data.id)
      if (!entry) return // a stale response from a superseded run
      clearTimeout(entry.timer)
      pending.current.delete(e.data.id)
      // The worker just proved it is alive and making progress. One worker
      // answers one request at a time, so anything still pending has been
      // sitting in the FIFO behind this one, burning a watchdog window it
      // never got to use — a race fans 2-4 requests out at once, and the
      // last lane's clock would otherwise start while three other lanes
      // are still ahead of it. Restart their windows from now.
      for (const [id, queued] of pending.current) {
        clearTimeout(queued.timer)
        queued.timer = arm(id, queued.limit)
      }
      entry.resolve(e.data.result)
      if (pending.current.size === 0) setBusy(false)
    }
  }

  if (workerRef.current === null) attachWorker()

  /** Resolves everything outstanding as cancelled and clears `busy`. */
  const cancelPending = useCallback(() => {
    const cancelled = Array.from(pending.current.values())
    pending.current.clear()
    setBusy(false)
    for (const entry of cancelled) {
      clearTimeout(entry.timer)
      entry.resolve(null)
    }
  }, [])

  /**
   * Abandons every in-flight request *and the computation behind it*.
   *
   * `postMessage` is fire-and-forget: once the worker has started a sort
   * there is no way to interrupt it short of terminating the worker, and a
   * single FIFO worker means a superseded request is not merely a wasted
   * result — it is dead weight in front of the request the user is actually
   * waiting for. Dragging the size slider in race mode queues eight or more
   * runs behind each other that way, and the tail of that queue can blow
   * its watchdog window purely from waiting.
   *
   * Callers invoke this once per *logical* dispatch, before sending the new
   * work: a race's own 2-4 concurrent lanes are one unit and must not
   * supersede each other, so the call belongs with the batch, not with
   * `run`. Superseded requests resolve with `null`, never with a timeout —
   * nothing timed out, the user simply changed their mind.
   */
  const supersede = useCallback(() => {
    if (pending.current.size === 0) return // nothing running; keep the warm worker
    replaceWorker()
    cancelPending()
  }, [replaceWorker, cancelPending])

  useEffect(() => {
    // StrictMode double-invokes effects on mount in development (setup,
    // cleanup, setup again) with no render in between, so the cleanup below
    // can null the ref before this setup runs a second time. Recreate the
    // worker here too rather than assuming the render-time guard above
    // already did it.
    if (workerRef.current === null) attachWorker()
    return () => {
      // Reads workerRef.current live, not a worker captured at effect-setup
      // time: reapWedgedWorker/supersede can have swapped it out since this
      // effect ran, and it's whichever worker is actually live that must be
      // torn down.
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
      cancelPending()
    }
  }, [attachWorker, cancelPending])

  const run = useCallback(
    (req: DistributiveOmit<RunRequest, 'id'>): Promise<RunOutcome> => {
      const id = nextId.current++
      const limit = req.limits?.maxMillis ?? DEFAULT_LIMITS.maxMillis
      setBusy(true)
      return new Promise<RunOutcome>((resolve) => {
        pending.current.set(id, { resolve, limit, timer: arm(id, limit) })
        workerRef.current!.postMessage({ ...req, id } as RunRequest)
      })
    },
    [arm],
  )

  return { run, supersede, busy }
}
