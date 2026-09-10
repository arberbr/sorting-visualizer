import { DISTRIBUTIONS, LARGE_N_WARNING, MAX_N, MIN_N, type Distribution } from '../core/generate'
import { RENDERERS, type RenderStyle } from '../render'

export interface ArraySettings {
  size: number
  distribution: Distribution
  seed: number
  style: RenderStyle
}

interface Props {
  settings: ArraySettings
  busy: boolean
  onChange: (next: ArraySettings) => void
  onRegenerate: () => void
}

export default function ArrayConfig({ settings, busy, onChange, onRegenerate }: Props) {
  const set = <K extends keyof ArraySettings>(key: K, value: ArraySettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <div className="config">
      <label className="config__row">
        <span className="label">size {settings.size}</span>
        <input
          type="range"
          min={MIN_N}
          max={MAX_N}
          value={settings.size}
          onChange={(e) => set('size', Number(e.target.value))}
          aria-label="Array size"
        />
      </label>
      {settings.size > LARGE_N_WARNING && (
        <p className="config__warn">
          Above {LARGE_N_WARNING} elements, quadratic algorithms may exceed the step limit.
        </p>
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
          value={settings.style}
          onChange={(e) => set('style', e.target.value as RenderStyle)}
          aria-label="Render style"
        >
          {RENDERERS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <button onClick={onRegenerate} disabled={busy}>
        {busy ? 'running…' : 'regenerate & run'}
      </button>
    </div>
  )
}
