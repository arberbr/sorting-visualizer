import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlgorithmPicker from './components/AlgorithmPicker'
import ApiReference from './components/ApiReference'
import ArrayConfig, { type ArraySettings } from './components/ArrayConfig'
import AudioToggle from './components/AudioToggle'
import Canvas from './components/Canvas'
import CodePanel from './components/CodePanel'
import Controls from './components/Controls'
import ErrorBanner from './components/ErrorBanner'
import RaceGrid from './components/RaceGrid'
import Telemetry, { formatCount } from './components/Telemetry'
import { ALGORITHMS, getAlgorithm } from './algorithms'
import { Sonifier } from './audio/sonifier'
import { loadDraft, saveDraft } from './customCode'
import { generate } from './core/generate'
import type { RunError, Trace } from './core/runner'
import { usePlayer } from './player/usePlayer'
import { useRace, type RaceInput } from './player/useRace'
import { DARK } from './render/theme'
import { useKeyboard } from './useKeyboard'
import { useRunner } from './worker/useRunner'

const DEFAULT_RACE_IDS = ['bubble', 'quick-lomuto']

const DEFAULT_SETTINGS: ArraySettings = {
  size: 64,
  distribution: 'random',
  seed: 1,
  style: 'bars',
}

/** How long a settings/algorithm change waits before it's actually dispatched. */
const DEBOUNCE_MS = 150

export default function App() {
  const [algorithmId, setAlgorithmId] = useState('quick-lomuto')
  const [settings, setSettings] = useState<ArraySettings>(DEFAULT_SETTINGS)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [sorted, setSorted] = useState(true)
  const [error, setError] = useState<RunError | null>(null)
  const [mode, setMode] = useState<'builtin' | 'custom' | 'race'>('builtin')
  const [source, setSource] = useState(() => loadDraft())
  const [raceIds, setRaceIds] = useState<string[]>(DEFAULT_RACE_IDS)
  const [raceInputs, setRaceInputs] = useState<RaceInput[]>([])

  useEffect(() => {
    saveDraft(source)
  }, [source])

  const { run, supersede, busy } = useRunner()
  const player = usePlayer(trace)
  const raceState = useRace(raceInputs)
  const algorithm = getAlgorithm(algorithmId)!

  // Off by default — a delight, not a requirement. One Sonifier for the
  // component's lifetime; the AudioContext inside it isn't created until the
  // toggle is actually clicked (browsers suspend it until a user gesture).
  const sonifier = useMemo(() => new Sonifier(), [])
  const [audioOn, setAudioOn] = useState(false)
  const [volume, setVolume] = useState(0.25)

  useEffect(() => () => sonifier.dispose(), [sonifier])

  useEffect(() => {
    sonifier.setEnabled(audioOn)
  }, [audioOn, sonifier])

  useEffect(() => {
    sonifier.setVolume(volume)
  }, [volume, sonifier])

  // Sound follows the single-run transport (builtin/custom), so it works
  // for playback and for single stepping alike. Deliberately not wired to
  // race mode: up to 4 lanes advancing independently would routinely blow
  // past MAX_VOICES and turn into noise rather than a signal, and the brief
  // only asked for the single-run case. In practice this needs no explicit
  // mode check — player.engine is paused whenever mode is 'race' (see the
  // transport-pause effect below), so it never emits frames, and this
  // effect stays inert, while the race view is silent.
  useEffect(() => {
    const engine = player.engine
    if (!engine || !audioOn) return
    let max = 1
    for (const v of engine.frame.main) if (v > max) max = v
    return engine.onFrame((frame) => {
      const i = frame.lastWrite.findIndex((t) => t === frame.index - 1)
      const j = i >= 0 ? i : frame.lastCompare.findIndex((t) => t === frame.index - 1)
      if (j >= 0) sonifier.note(frame.main[j], max)
    })
  }, [player.engine, audioOn, sonifier])

  // Guards against a slow, superseded request clobbering a newer one's
  // result. The worker replies in the order it receives requests today
  // (see sortRunner.worker.ts), so in practice responses already arrive in
  // order — this is a belt-and-braces check, not a fix for an observed
  // reordering.
  //
  // It only discards stale *results*, though; `supersede()` is what stops
  // the stale *work*. Every dispatch below bumps this counter and then
  // calls `supersede()` exactly once — once per logical dispatch, so a
  // race's own concurrent lanes never cancel each other — which terminates
  // the worker mid-computation and hands the fresh one an empty queue.
  // Without it a superseded run keeps burning the single FIFO worker in
  // front of the run the user is actually waiting for.
  const requestSeq = useRef(0)

  const start = useCallback(
    async (id: string, s: ArraySettings) => {
      const seq = ++requestSeq.current
      supersede()
      const cap = getAlgorithm(id)?.meta.maxN
      let capped: number[]
      try {
        // generate() enforces its own MIN_N floor of 8 regardless of what
        // was asked for, so a cap below 8 (bogosort's is 7) can't be
        // honoured by generating at the capped size directly — generate at
        // a legal size, then trim down to the cap. The trimmed values are
        // still the same positive integers generate() produced, which is
        // all any algorithm requires.
        const input = generate(Math.max(8, s.size), s.distribution, s.seed)
        capped = cap ? input.slice(0, cap) : input
      } catch (e) {
        if (seq !== requestSeq.current) return
        setError({ code: 'runtime', message: e instanceof Error ? e.message : String(e) })
        setTrace(null)
        return
      }
      const result = await run({ kind: 'builtin', algorithmId: id, input: capped })
      if (seq !== requestSeq.current) return // superseded by a later run
      if (!result) return // cancelled outright — no result, and nothing to report
      if (result.ok) {
        setError(null)
        setSorted(result.sorted)
        setTrace(result.trace)
      } else {
        setError(result.error)
        setTrace(null)
      }
    },
    [run, supersede],
  )

  // Mirrors `start` above: same shared `requestSeq` counter (so a late
  // custom response can't clobber a newer builtin run or vice versa), same
  // never-throws contract for generate()'s RangeError.
  const runCustom = useCallback(async () => {
    const seq = ++requestSeq.current
    supersede()
    let input: number[]
    try {
      input = generate(Math.max(8, settings.size), settings.distribution, settings.seed)
    } catch (e) {
      if (seq !== requestSeq.current) return
      setError({ code: 'runtime', message: e instanceof Error ? e.message : String(e) })
      setTrace(null)
      return
    }
    const result = await run({ kind: 'custom', source, input })
    if (seq !== requestSeq.current) return // superseded by a later run
    if (!result) return // cancelled outright — no result, and nothing to report
    if (result.ok) {
      setError(null)
      setSorted(result.sorted)
      setTrace(result.trace)
    } else {
      setError(result.error)
      setTrace(null)
    }
  }, [run, supersede, settings, source])

  // Fires every lane's run concurrently over one shared input, same shared
  // `requestSeq` counter as `start`/`runCustom` (so a stale race batch can't
  // clobber a newer builtin/custom/race result, and vice versa). `run()`
  // never rejects — a lane that fails resolves with `ok: false` rather than
  // throwing — so Promise.all always settles and `busy` can never wedge on
  // one bad lane; the successful lanes still populate the grid, and the
  // first failure surfaces in the error banner.
  const startRace = useCallback(async () => {
    const seq = ++requestSeq.current
    // Once, for the whole batch: the lanes below are one logical dispatch
    // and must not cancel each other.
    supersede()
    let input: number[]
    try {
      input = generate(Math.max(8, settings.size), settings.distribution, settings.seed)
    } catch (e) {
      if (seq !== requestSeq.current) return
      setError({ code: 'runtime', message: e instanceof Error ? e.message : String(e) })
      setRaceInputs([])
      return
    }
    const results = await Promise.all(
      raceIds.map((id) => {
        // Same maxN trimming as `start`: a lane running a capped algorithm
        // (e.g. bogosort) must not receive more input than it can finish.
        const cap = getAlgorithm(id)?.meta.maxN
        const capped = cap ? input.slice(0, cap) : input
        return run({ kind: 'builtin', algorithmId: id, input: capped })
      }),
    )
    if (seq !== requestSeq.current) return // superseded by a later run
    const lanes: RaceInput[] = []
    let firstError: RunError | null = null
    results.forEach((result, i) => {
      if (!result) return // cancelled lane — nothing to show and nothing to report
      if (result.ok) {
        lanes.push({
          id: raceIds[i],
          label: getAlgorithm(raceIds[i])!.meta.name,
          trace: result.trace,
        })
      } else if (!firstError) {
        firstError = result.error
      }
    })
    setError(firstError)
    setRaceInputs(lanes)
  }, [raceIds, run, supersede, settings])

  // Re-run whenever the algorithm or the input definition changes.
  //
  // Leading-edge + trailing debounce: the first change after a quiet spell
  // dispatches immediately (a discrete action — clicking an algorithm, the
  // initial mount — is never held back), and any further changes that land
  // within DEBOUNCE_MS of it coalesce into a single trailing dispatch at
  // the end of that window instead of firing once per intermediate value
  // (dragging the size slider fires one settings change per pixel; each
  // would otherwise reset the transport, since usePlayer resets on every
  // new trace, flickering the canvas mid-drag).
  //
  // Correctness no longer depends on this debounce: useRunner's own effect
  // cleanup now clears its pending-request map and resets `busy` whenever
  // its Worker is torn down — including StrictMode's synthetic
  // mount/cleanup/mount replay — so an orphaned request can no longer wedge
  // `busy`. A leading dispatch and a trailing one can therefore legitimately
  // both be in flight at once; `requestSeq` above discards whichever
  // response isn't for the most recently dispatched request.
  //
  // Guarded to only fire in 'builtin' mode: in 'custom' mode, re-running
  // arbitrary user code on every settings tweak (a slider drag, a seed bump)
  // isn't something to do implicitly — the user decides when to spend cycles
  // running their own code, via the Run button. `mode` is still a dependency
  // here (not just an inline check) so that switching *back* from 'custom'
  // to 'builtin' immediately refreshes the trace — otherwise the canvas and
  // telemetry would keep showing the custom run's result under the builtin
  // algorithm's name until some other setting happened to change.
  const inWindow = useRef(false)
  const windowTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (mode !== 'builtin') return
    if (!inWindow.current) {
      inWindow.current = true
      void start(algorithmId, settings)
      windowTimer.current = window.setTimeout(() => {
        inWindow.current = false
      }, DEBOUNCE_MS)
    } else {
      clearTimeout(windowTimer.current)
      windowTimer.current = window.setTimeout(() => {
        inWindow.current = false
        void start(algorithmId, settings)
      }, DEBOUNCE_MS)
    }
    return () => clearTimeout(windowTimer.current)
  }, [mode, algorithmId, settings, start])

  // Same leading-edge + trailing debounce as the effect above, kept as an
  // independent timer/flag pair rather than sharing one with `start` so a
  // burst of settings changes while switching between 'builtin' and 'race'
  // can't leave either debounce window in a confused state.
  const raceInWindow = useRef(false)
  const raceWindowTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (mode !== 'race') return
    if (!raceInWindow.current) {
      raceInWindow.current = true
      void startRace()
      raceWindowTimer.current = window.setTimeout(() => {
        raceInWindow.current = false
      }, DEBOUNCE_MS)
    } else {
      clearTimeout(raceWindowTimer.current)
      raceWindowTimer.current = window.setTimeout(() => {
        raceInWindow.current = false
        void startRace()
      }, DEBOUNCE_MS)
    }
    return () => clearTimeout(raceWindowTimer.current)
  }, [mode, raceIds, settings, startRace])

  // There is exactly one requestAnimationFrame loop per transport
  // (usePlayer's and useRace's), and each only runs while its own `playing`
  // flag is true. Nothing stops both flags from being true at once, though —
  // e.g. pressing play in builtin mode, then switching to race mode without
  // pausing first, which would otherwise leave the builtin loop ticking
  // (and re-rendering App on every UI-refresh tick) behind an unmounted
  // Canvas. Whichever transport's view isn't currently active gets paused
  // when the mode changes away from it.
  useEffect(() => {
    if (mode === 'race') player.pause()
  }, [mode]) // eslint-disable-line -- player.pause is a stable setState wrapper; omitted deliberately

  useEffect(() => {
    if (mode !== 'race') raceState.pause()
  }, [mode]) // eslint-disable-line -- same as above, for raceState.pause

  // Keyboard transport follows whichever view is on screen: the race
  // transport in race mode, the single-run player in builtin/custom mode.
  // Both expose the same toggle/stepForward/stepBack/seek/total surface.
  const transport = mode === 'race' ? raceState : player
  useKeyboard({
    onToggle: transport.toggle,
    onStep: (d) => (d > 0 ? transport.stepForward() : transport.stepBack()),
    onStart: () => transport.seek(0),
    onEnd: () => transport.seek(transport.total),
  })

  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
        <span className="label app__shortcuts">space play · ← → step · home/end jump</span>
        <AudioToggle
          enabled={audioOn}
          volume={volume}
          onToggle={() => setAudioOn((v) => !v)}
          onVolume={setVolume}
        />
        <div className="mode">
          <button aria-pressed={mode === 'builtin'} onClick={() => setMode('builtin')}>
            library
          </button>
          <button aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}>
            your code
          </button>
          <button aria-pressed={mode === 'race'} onClick={() => setMode('race')}>
            race
          </button>
        </div>
      </header>

      <nav className="app__rail" aria-label="Algorithms">
        <ArrayConfig
          settings={settings}
          busy={busy}
          onChange={setSettings}
          onRegenerate={() => setSettings((s) => ({ ...s, seed: s.seed + 1 }))}
        />
        {mode === 'builtin' && <AlgorithmPicker selectedId={algorithmId} onSelect={setAlgorithmId} />}
        {mode === 'race' && (
          <div className="config">
            <div className="label">race lanes (2–4)</div>
            {raceIds.map((id, slot) => (
              <div className="race-lanes__row" key={slot}>
                <select
                  value={id}
                  aria-label={`Lane ${slot + 1}`}
                  onChange={(e) =>
                    setRaceIds((ids) => ids.map((v, k) => (k === slot ? e.target.value : v)))
                  }
                >
                  {/* Each algorithm can only race in one lane at a time — a
                      lane's own current selection stays in its own list, but
                      other lanes' picks are hidden so two lanes can never
                      collide on the same id. RaceEngine/RaceGrid key every
                      lane by that id, so a collision would mean duplicate
                      React keys and two lanes fighting over one canvas. */}
                  {ALGORITHMS.filter(
                    (a) => a.meta.id === id || !raceIds.includes(a.meta.id),
                  ).map((a) => (
                    <option key={a.meta.id} value={a.meta.id}>
                      {a.meta.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                disabled={raceIds.length >= 4}
                onClick={() =>
                  setRaceIds((ids) => {
                    const next = ALGORITHMS.find((a) => !ids.includes(a.meta.id))
                    return next ? [...ids, next.meta.id] : ids
                  })
                }
              >
                add lane
              </button>
              <button
                disabled={raceIds.length <= 2}
                onClick={() => setRaceIds((ids) => ids.slice(0, -1))}
              >
                remove lane
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className={`app__stage${mode === 'custom' ? ' app__stage--split' : ''}`}>
        {mode === 'race' ? (
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }}>
            {raceState.race && (
              <RaceGrid race={raceState.race} style={settings.style} theme={DARK} />
            )}
            <ErrorBanner error={error} onDismiss={() => setError(null)} />
          </div>
        ) : (
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }}>
            <Canvas engine={player.engine} style={settings.style} theme={DARK} />
            <ErrorBanner error={error} onDismiss={() => setError(null)} />
          </div>
        )}
        {mode === 'custom' && (
          <CodePanel
            source={source}
            busy={busy}
            error={error}
            onSourceChange={setSource}
            onRun={runCustom}
          />
        )}
      </main>

      <section className="app__controls">
        {mode === 'race' ? (
          <Controls
            playing={raceState.playing}
            index={raceState.index}
            total={raceState.total}
            speed={raceState.speed}
            disabled={!raceState.race}
            onToggle={raceState.toggle}
            onStep={(d) => (d > 0 ? raceState.stepForward() : raceState.stepBack())}
            onSeek={raceState.seek}
            onSpeed={raceState.setSpeed}
          />
        ) : (
          <Controls
            playing={player.playing}
            index={player.index}
            total={player.total}
            speed={player.speed}
            disabled={!trace}
            onToggle={player.toggle}
            onStep={(d) => (d > 0 ? player.stepForward() : player.stepBack())}
            onSeek={player.seek}
            onSpeed={player.setSpeed}
          />
        )}
      </section>

      <aside className="app__inspector">
        {mode === 'custom' ? (
          <>
            <section className="inspector__block">
              <div className="label">result</div>
              <span className={`chip chip--${sorted ? 'ok' : 'bad'}`}>
                {sorted ? 'sorted' : 'not sorted'}
              </span>
              <dl className="grid2" style={{ marginTop: 'var(--space-3)' }}>
                <div className="readout">
                  <dt>compares</dt>
                  <dd className="num">
                    {(player.engine?.frame.counts.compares ?? 0).toLocaleString()}
                  </dd>
                </div>
                <div className="readout">
                  <dt>swaps</dt>
                  <dd className="num">{(player.engine?.frame.counts.swaps ?? 0).toLocaleString()}</dd>
                </div>
              </dl>
            </section>
            <ApiReference />
          </>
        ) : mode === 'race' ? (
          <div className="inspector">
            <section className="inspector__block">
              <div className="label">race</div>
              <p className="inspector__desc">
                {raceState.race
                  ? `${raceState.race.lanes.length} lanes over one shared input. ${formatCount(raceState.total)} steps to the longest trace.`
                  : 'Pick 2–4 algorithms in the rail to start a race.'}
              </p>
            </section>
            {raceState.race?.lanes.map((lane) => {
              const meta = getAlgorithm(lane.id)?.meta
              if (!meta) return null
              return (
                <section className="inspector__block" key={lane.id}>
                  <div className="label">{lane.label}</div>
                  <div className="chips" style={{ marginTop: 'var(--space-2)' }}>
                    <span className="chip mono">avg {meta.average}</span>
                    <span className="chip">{meta.stable ? 'stable' : 'unstable'}</span>
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <Telemetry
            counts={player.engine?.frame.counts ?? { reads: 0, writes: 0, compares: 0, swaps: 0 }}
            index={player.index}
            total={player.total}
            sorted={sorted}
            algorithm={algorithm}
          />
        )}
      </aside>
    </div>
  )
}
