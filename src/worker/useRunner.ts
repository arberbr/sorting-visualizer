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
    const worker = workerRef.current!
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
