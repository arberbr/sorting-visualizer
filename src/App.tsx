import { useCallback, useEffect, useRef, useState } from 'react'
import AlgorithmPicker from './components/AlgorithmPicker'
import ApiReference from './components/ApiReference'
import ArrayConfig, { type ArraySettings } from './components/ArrayConfig'
import Canvas from './components/Canvas'
import CodePanel from './components/CodePanel'
import Controls from './components/Controls'
import ErrorBanner from './components/ErrorBanner'
import Telemetry from './components/Telemetry'
import { getAlgorithm } from './algorithms'
import { loadDraft, saveDraft } from './customCode'
import { generate } from './core/generate'
import type { RunError, Trace } from './core/runner'
import { usePlayer } from './player/usePlayer'
import { DARK } from './render/theme'
import { useRunner } from './worker/useRunner'

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
  const [mode, setMode] = useState<'builtin' | 'custom'>('builtin')
  const [source, setSource] = useState(() => loadDraft())

  useEffect(() => {
    saveDraft(source)
  }, [source])

  const { run, busy } = useRunner()
  const player = usePlayer(trace)
  const algorithm = getAlgorithm(algorithmId)!

  // Guards against a slow, superseded request clobbering a newer one's
  // result. The worker replies in the order it receives requests today
  // (see sortRunner.worker.ts), so in practice responses already arrive in
  // order — this is a belt-and-braces check, not a fix for an observed
  // reordering.
  const requestSeq = useRef(0)

  const start = useCallback(
    async (id: string, s: ArraySettings) => {
      const seq = ++requestSeq.current
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
      if (result.ok) {
        setError(null)
        setSorted(result.sorted)
        setTrace(result.trace)
      } else {
        setError(result.error)
        setTrace(null)
      }
    },
    [run],
  )

  // Mirrors `start` above: same shared `requestSeq` counter (so a late
  // custom response can't clobber a newer builtin run or vice versa), same
  // never-throws contract for generate()'s RangeError.
  const runCustom = useCallback(async () => {
    const seq = ++requestSeq.current
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
    if (result.ok) {
      setError(null)
      setSorted(result.sorted)
      setTrace(result.trace)
    } else {
      setError(result.error)
      setTrace(null)
    }
  }, [run, settings, source])

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

  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
        <div className="mode">
          <button aria-pressed={mode === 'builtin'} onClick={() => setMode('builtin')}>
            library
          </button>
          <button aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}>
            your code
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
      </nav>

      <main className={`app__stage${mode === 'custom' ? ' app__stage--split' : ''}`}>
        <div style={{ position: 'relative', minHeight: 0, height: '100%' }}>
          <Canvas engine={player.engine} style={settings.style} theme={DARK} />
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        </div>
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
