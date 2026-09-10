import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Owns the worker and matches responses to requests by id. */
export function useRunner(createWorker: () => WorkerLike = defaultFactory) {
  const workerRef = useRef<WorkerLike | null>(null)
  const nextId = useRef(1)
  const pending = useRef(new Map<number, (r: RunResult) => void>())
  const [busy, setBusy] = useState(false)

  if (workerRef.current === null) workerRef.current = createWorker()

  useEffect(() => {
    // StrictMode double-invokes effects on mount in development (setup,
    // cleanup, setup again) with no render in between, so the cleanup below
    // can null the ref before this setup runs a second time. Recreate the
    // worker here too rather than assuming the render-time guard above
    // already did it.
    if (workerRef.current === null) workerRef.current = createWorker()
    const worker = workerRef.current
    const onMessage = (e: { data: RunResponse }) => {
      const resolve = pending.current.get(e.data.id)
      if (!resolve) return // a stale response from a superseded run
      pending.current.delete(e.data.id)
      resolve(e.data.result)
      if (pending.current.size === 0) setBusy(false)
    }
    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
      workerRef.current = null
      // A terminated worker can never answer whatever requests are still
      // outstanding — their resolvers would otherwise sit in `pending`
      // forever, permanently wedging `busy` true. This fires on every real
      // unmount too (harmless — nothing is left to observe it) and, in
      // development, on StrictMode's synthetic cleanup between its two
      // mount passes, which is the case that actually matters: a request
      // dispatched during the first pass is always sent to a worker that's
      // about to be replaced, and would otherwise never resolve.
      pending.current.clear()
      setBusy(false)
    }
  }, [])

  const run = useCallback((req: DistributiveOmit<RunRequest, 'id'>): Promise<RunResult> => {
    const id = nextId.current++
    setBusy(true)
    return new Promise<RunResult>((resolve) => {
      pending.current.set(id, resolve)
      workerRef.current!.postMessage({ ...req, id } as RunRequest)
    })
  }, [])

  return { run, busy }
}
