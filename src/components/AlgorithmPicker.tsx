import { algorithmsByFamily } from '../algorithms'

interface Props {
  selectedId: string
  onSelect: (id: string) => void
}

export default function AlgorithmPicker({ selectedId, onSelect }: Props) {
  return (
    <div className="picker">
      {algorithmsByFamily().map((group) => (
        <section key={group.family} className="picker__group">
          <div className="label picker__label">{group.label}</div>
          <ul className="picker__list">
            {group.items.map((algo) => (
              <li key={algo.meta.id}>
                <button
                  className="picker__item"
                  aria-pressed={algo.meta.id === selectedId}
                  onClick={() => onSelect(algo.meta.id)}
                >
                  <span className="picker__name">{algo.meta.name}</span>
                  <span className="picker__badge mono">{algo.meta.average}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
