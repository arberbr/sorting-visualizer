import { SPEEDS } from '../player/timing'
import { formatCount } from './Telemetry'

interface Props {
  playing: boolean
  index: number
  total: number
  speed: number
  disabled: boolean
  onToggle: () => void
  onStep: (delta: number) => void
  onSeek: (index: number) => void
  onSpeed: (speed: number) => void
}

export default function Controls({
  playing,
  index,
  total,
  speed,
  disabled,
  onToggle,
  onStep,
  onSeek,
  onSpeed,
}: Props) {
  const speedIndex = Math.max(0, SPEEDS.indexOf(speed))
  return (
    <div className="controls">
      <div className="controls__transport">
        <button onClick={() => onSeek(0)} disabled={disabled} aria-label="Jump to start">
          |◀
        </button>
        <button onClick={() => onStep(-1)} disabled={disabled} aria-label="Step back">
          ◀
        </button>
        <button onClick={onToggle} disabled={disabled} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚ pause' : '▶ play'}
        </button>
        <button onClick={() => onStep(1)} disabled={disabled} aria-label="Step forward">
          ▶
        </button>
        <button onClick={() => onSeek(total)} disabled={disabled} aria-label="Jump to end">
          ▶|
        </button>
        <span className="num controls__position" data-testid="position">
          {formatCount(index)} / {formatCount(total)}
        </span>
      </div>

      <label className="controls__scrub">
        <span className="label">timeline</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          value={index}
          disabled={disabled}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Timeline"
        />
      </label>

      <label className="controls__speed">
        <span className="label">speed {formatCount(speed)}/s</span>
        <input
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          value={speedIndex}
          disabled={disabled}
          onChange={(e) => onSpeed(SPEEDS[Number(e.target.value)])}
          aria-label="Speed"
        />
      </label>
    </div>
  )
}
