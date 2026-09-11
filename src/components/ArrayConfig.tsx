import { DISTRIBUTIONS, type Distribution, LARGE_N_WARNING, MAX_N, MIN_N } from '../core/generate'
import { RENDERERS, type RenderStyle } from '../render'

/**
 * Everything that defines the *input* — and therefore everything a change to
 * which means re-running the sort. The render style is deliberately not in
 * here: it only decides how an existing trace is drawn, and living in this
 * object made switching style re-run the whole sort in the worker, re-clone
 * the trace and reset the transport to step 0 (times four, in race mode).
 */
export interface ArraySettings {
  size: number
  distribution: Distribution
  seed: number
}

interface Props {
  settings: ArraySettings
  style: RenderStyle
  /** Largest array this mode allows — below MAX_N only in race mode. */
  sizeCap: number
  busy: boolean
  onChange: (next: ArraySettings) => void
  onStyleChange: (next: RenderStyle) => void
  onRegenerate: () => void
}

export default function ArrayConfig({
  settings,
  style,
  sizeCap,
  busy,
  onChange,
  onStyleChange,
  onRegenerate,
}: Props) {
  const set = <K extends keyof ArraySettings>(key: K, value: ArraySettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <div className="config">
      <label className="config__row">
        <span className="label">size {settings.size}</span>
        <input
          type="range"
          min={MIN_N}
          max={sizeCap}
          value={settings.size}
          onChange={(e) => set('size', Number(e.target.value))}
          aria-label="Array size"
        />
      </label>
      {sizeCap < MAX_N ? (
        <p className="config__warn">
          Racing is capped at {sizeCap} elements: every lane keeps its own full trace of every
          operation it performs, so four lanes hold four traces at once.
        </p>
      ) : (
        settings.size > LARGE_N_WARNING && (
          <p className="config__warn">
            Above {LARGE_N_WARNING} elements, traces take longer to compute and bars become
            sub-pixel and hard to read.
          </p>
        )
      )}

      <label className="config__row">
        <span className="label">distribution</span>
        <select
          value={settings.distribution}
          onChange={(e) => set('distribution', e.target.value as Distribution)}
          aria-label="Distribution"
        >
          {DISTRIBUTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="config__row">
        <span className="label">seed</span>
        <input
          type="number"
          value={settings.seed}
          onChange={(e) => set('seed', Number(e.target.value))}
          aria-label="Seed"
        />
      </label>

      <label className="config__row">
        <span className="label">render</span>
        <select
          value={style}
          onChange={(e) => onStyleChange(e.target.value as RenderStyle)}
          aria-label="Render style"
        >
          {RENDERERS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={onRegenerate} disabled={busy}>
        {busy ? 'running…' : 'regenerate & run'}
      </button>
    </div>
  )
}
