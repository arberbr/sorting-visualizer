import type { Algorithm } from '../algorithms'
import type { Counts } from '../core/types'

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

interface Props {
  counts: Counts
  index: number
  total: number
  sorted: boolean
  algorithm: Algorithm
}

const COUNTERS: ReadonlyArray<[keyof Counts, string]> = [
  ['compares', 'compares'],
  ['swaps', 'swaps'],
  ['reads', 'reads'],
  ['writes', 'writes'],
]

export default function Telemetry({ counts, index, total, sorted, algorithm }: Props) {
  const { meta } = algorithm
  return (
    <div className="inspector">
      <section className="inspector__block">
        <div className="label">algorithm</div>
        <h2 className="inspector__name">{meta.name}</h2>
        <p className="inspector__desc">{meta.description}</p>
        <div className="chips">
          <span className="chip">{meta.stable ? 'stable' : 'unstable'}</span>
          <span className="chip">{meta.inPlace ? 'in place' : 'out of place'}</span>
        </div>
      </section>

      <section className="inspector__block">
        <div className="label">complexity</div>
        <dl className="grid2">
          <dt>best</dt>
          <dd className="mono" data-testid="complexity-best">
            {meta.best}
          </dd>
          <dt>average</dt>
          <dd className="mono" data-testid="complexity-average">
            {meta.average}
          </dd>
          <dt>worst</dt>
          <dd className="mono" data-testid="complexity-worst">
            {meta.worst}
          </dd>
          <dt>space</dt>
          <dd className="mono" data-testid="complexity-space">
            {meta.space}
          </dd>
        </dl>
      </section>

      <section className="inspector__block">
        <div className="label">telemetry</div>
        <dl className="grid2">
          {COUNTERS.map(([key, label]) => (
            <div className="readout" key={key}>
              <dt>{label}</dt>
              <dd className="num" data-testid={`count-${key}`}>
                {formatCount(counts[key])}
              </dd>
            </div>
          ))}
          <div className="readout">
            <dt>steps</dt>
            <dd className="num">
              {formatCount(index)} / {formatCount(total)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="inspector__block">
        <div className="label">result</div>
        <span
          className={`chip chip--${sorted ? 'ok' : 'bad'}`}
          data-testid="verdict"
        >
          {sorted ? 'sorted' : 'not sorted'}
        </span>
      </section>
    </div>
  )
}
