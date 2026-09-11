interface Props {
  enabled: boolean
  volume: number
  onToggle: () => void
  onVolume: (v: number) => void
}

export default function AudioToggle({ enabled, volume, onToggle, onVolume }: Props) {
  return (
    <div className="audio">
      <button type="button" aria-pressed={enabled} onClick={onToggle} aria-label="Toggle sound">
        {enabled ? '\u{1F50A} sound' : '\u{1F508} muted'}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        disabled={!enabled}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        aria-label="Volume"
      />
    </div>
  )
}
