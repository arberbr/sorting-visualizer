import { useCallback, useEffect, useState } from 'react'
import AlgorithmPicker from './components/AlgorithmPicker'
import ArrayConfig, { type ArraySettings } from './components/ArrayConfig'
import Canvas from './components/Canvas'
import Controls from './components/Controls'
import ErrorBanner from './components/ErrorBanner'
import Telemetry from './components/Telemetry'
import { getAlgorithm } from './algorithms'
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

export default function App() {
  const [algorithmId, setAlgorithmId] = useState('quick-lomuto')
  const [settings, setSettings] = useState<ArraySettings>(DEFAULT_SETTINGS)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [sorted, setSorted] = useState(true)
  const [error, setError] = useState<RunError | null>(null)

  const { run, busy } = useRunner()
  const player = usePlayer(trace)
  const algorithm = getAlgorithm(algorithmId)!

  const start = useCallback(
    async (id: string, s: ArraySettings) => {
      const cap = getAlgorithm(id)?.meta.maxN
      // generate() enforces its own MIN_N floor of 8 regardless of what was
      // asked for, so a cap below 8 (bogosort's is 7) can't be honoured by
      // generating at the capped size directly — generate at a legal size,
      // then trim down to the cap. The trimmed values are still the same
      // positive integers generate() produced, which is all any algorithm
      // requires.
      const input = generate(Math.max(8, s.size), s.distribution, s.seed)
      const capped = cap ? input.slice(0, cap) : input
      const result = await run({ kind: 'builtin', algorithmId: id, input: capped })
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

  // Re-run whenever the algorithm or the input definition changes.
  //
  // StrictMode double-invokes this effect on mount (setup, cleanup, setup
  // again) synchronously, with no render in between. useRunner's own effect
  // goes through the same cycle and its cleanup *terminates* the Worker it
  // just created — so a request dispatched from the first setup is always
  // sent to a Worker that's doomed to be killed before it can reply, and
  // that request's promise then never resolves. Because useRunner's `busy`
  // only flips back to false once every outstanding request has resolved,
  // one permanently-orphaned request leaves it stuck true forever, wedging
  // the "regenerate & run" button.
  //
  // Deferring the actual dispatch past the current synchronous tick (rather
  // than trying to dedupe the two calls) fixes this at the root: cleanup
  // cancels the first setup's still-pending dispatch before it ever fires,
  // so only the second setup's dispatch — made once everything, including
  // the Worker, has settled — actually reaches the network/Worker. A real
  // settings change still runs on the next tick, imperceptibly.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) void start(algorithmId, settings)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [algorithmId, settings, start])

  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
      </header>

      <nav className="app__rail" aria-label="Algorithms">
        <ArrayConfig
          settings={settings}
          busy={busy}
          onChange={setSettings}
          onRegenerate={() => setSettings((s) => ({ ...s, seed: s.seed + 1 }))}
        />
        <AlgorithmPicker selectedId={algorithmId} onSelect={setAlgorithmId} />
      </nav>

      <main className="app__stage">
        <Canvas engine={player.engine} style={settings.style} theme={DARK} />
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
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
        <Telemetry
          counts={player.engine?.frame.counts ?? { reads: 0, writes: 0, compares: 0, swaps: 0 }}
          index={player.index}
          total={player.total}
          sorted={sorted}
          algorithm={algorithm}
        />
      </aside>
    </div>
  )
}
