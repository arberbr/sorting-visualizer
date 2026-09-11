import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../core/runner'
import { PlayerEngine } from './engine'
import { RaceEngine } from './raceEngine'
import { SPEEDS } from './timing'

/** How often the React-visible index updates. Mirrors usePlayer's UI_REFRESH_MS. */
const UI_REFRESH_MS = 60

export interface RaceInput {
  id: string
  label: string
  trace: Trace
}

/**
 * Same transport surface as usePlayer, but driving a RaceEngine over several
 * lanes instead of a single PlayerEngine. This adds the codebase's second
 * requestAnimationFrame call site — deliberately: it must never run at the
 * same time as usePlayer's loop for the same view. App.tsx is responsible
 * for pausing whichever transport isn't currently visible.
 */
export function useRace(inputs: readonly RaceInput[]) {
  const race = useMemo(
    () =>
      inputs.length > 0
        ? new RaceEngine(
            inputs.map((i) => ({ id: i.id, label: i.label, engine: new PlayerEngine(i.trace) })),
          )
        : null,
    [inputs],
  )

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[6])
  const [index, setIndexState] = useState(0)
  const lastUiUpdate = useRef(0)

  // A new set of lanes resets the transport.
  useEffect(() => {
    setIndexState(0)
    setPlaying(false)
  }, [race])

  const syncIndex = useCallback(
    (force: boolean) => {
      if (!race) return
      const now = performance.now()
      if (force || now - lastUiUpdate.current >= UI_REFRESH_MS) {
        lastUiUpdate.current = now
        setIndexState(race.index)
      }
    },
    [race],
  )

  useEffect(() => {
    if (!race || !playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      race.tick(dt, speed)
      syncIndex(false)
      if (race.finished) {
        setPlaying(false)
        setIndexState(race.index)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [race, playing, speed, syncIndex])

  const act = useCallback(
    (fn: (r: RaceEngine) => void) => {
      if (!race) return
      fn(race)
      syncIndex(true)
    },
    [race, syncIndex],
  )

  return {
    race,
    index,
    total: race?.total ?? 0,
    playing,
    speed,
    setSpeed,
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    seek: (i: number) => act((r) => r.seek(i)),
    stepForward: () => act((r) => r.stepBy(1)),
    stepBack: () => act((r) => r.stepBy(-1)),
  }
}
