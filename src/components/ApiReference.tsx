import { API_ENTRIES } from './apiEntries'

export default function ApiReference() {
  return (
    <section className="inspector__block">
      <div className="label">the array API</div>
      <p className="inspector__desc">
        Your function receives an instrumented array. Every call below is recorded and animated.
      </p>
      <dl className="api">
        {API_ENTRIES.map((entry) => (
          <div className="api__row" key={entry.member}>
            <dt className="mono api__sig">{entry.signature}</dt>
            <dd className="api__desc">{entry.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
