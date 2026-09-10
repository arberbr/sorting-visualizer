import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../core/runner'
import { PlayerEngine } from './engine'
import { SPEEDS } from './timing'

/** How often the React-visible index updates. The canvas redraws every frame regardless. */
const UI_REFRESH_MS = 60

export function usePlayer(trace: Trace | null) {
  const engine = useMemo(() => (trace ? new PlayerEngine(trace) : null), [trace])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[6])
  const [index, setIndexState] = useState(0)
  const lastUiUpdate = useRef(0)

  // A new trace resets the transport.
  useEffect(() => {
    setIndexState(0)
    setPlaying(false)
  }, [engine])

  const syncIndex = useCallback(
    (force: boolean) => {
      if (!engine) return
      const now = performance.now()
      if (force || now - lastUiUpdate.current >= UI_REFRESH_MS) {
        lastUiUpdate.current = now
        setIndexState(engine.index)
      }
    },
    [engine],
  )

  useEffect(() => {
    if (!engine || !playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      engine.tick(dt, speed)
      syncIndex(false)
      if (engine.atEnd) {
        setPlaying(false)
        setIndexState(engine.index)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, playing, speed, syncIndex])

  const act = useCallback(
    (fn: (e: PlayerEngine) => void) => {
      if (!engine) return
      fn(engine)
      syncIndex(true)
    },
    [engine, syncIndex],
  )

  return {
    engine,
    index,
    total: engine?.total ?? 0,
    playing,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    seek: (i: number) => act((e) => e.seek(i)),
    stepForward: () => act((e) => e.stepBy(1)),
    stepBack: () => act((e) => e.stepBy(-1)),
    toStart: () => act((e) => e.seek(0)),
    toEnd: () => act((e) => e.seek(e.total)),
  }
}
