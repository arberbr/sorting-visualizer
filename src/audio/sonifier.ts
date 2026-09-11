import { MAX_VOICES, NOTE_MS, pitchFor } from './pitch'

/**
 * Plays one short tone per event, pitched by value. Voices are pooled and
 * capped so that fast playback does not turn into a click storm.
 *
 * Two things beyond a plain oscillator pool:
 *
 * - A DynamicsCompressorNode sits between the master gain and the
 *   destination as a safety limiter. Up to MAX_VOICES notes can legitimately
 *   overlap during fast playback; their summed peaks can exceed the
 *   destination's -1..1 range and hard-clip into noise without one.
 * - Playback is muted (and no new notes are scheduled) while the tab is
 *   hidden, per `document.visibilitychange` — a background tab must never
 *   make noise, and a note scheduled just before the tab is hidden would
 *   otherwise still be audible for the rest of its ~55ms envelope.
 */
export class Sonifier {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private active = 0
  private volume = 0.25
  private on = false
  private hidden = typeof document !== 'undefined' && document.hidden

  private readonly onVisibilityChange = (): void => {
    this.hidden = document.hidden
    this.applyGain()
  }

  get enabled(): boolean {
    return this.on
  }

  setEnabled(on: boolean): void {
    this.on = on
    if (on) this.ensure()
    this.applyGain()
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    this.applyGain()
  }

  note(value: number, max: number): void {
    // Nothing to hear (and nothing worth scheduling) when off or hidden.
    if (!this.on || this.hidden) return
    const ctx = this.ensure()
    if (!ctx || this.active >= MAX_VOICES) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = pitchFor(value, max)

    const seconds = NOTE_MS / 1000
    // Peak at 0.8, not 1 — extra headroom alongside the limiter below, since
    // up to MAX_VOICES of these can be summing into the master gain at once.
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.8, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

    osc.connect(gain).connect(this.master!)
    this.active++
    osc.onended = () => {
      this.active--
      gain.disconnect()
    }
    osc.start(now)
    osc.stop(now + seconds)
  }

  dispose(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }

  /** The single source of truth for the master gain: on, volume, hidden. */
  private applyGain(): void {
    if (!this.master || !this.ctx) return
    const target = this.on && !this.hidden ? this.volume : 0
    // A short ramp rather than an instant set — a hard cut mid-note would
    // itself produce an audible click, which mute is supposed to avoid.
    // 10ms reads as instant to a listener while staying click-free.
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01)
  }

  private ensure(): AudioContext | null {
    if (typeof document !== 'undefined') {
      // Idempotent: attaching the same bound listener twice is a documented
      // no-op, so this safely re-attaches after a dispose() removed it —
      // notably React StrictMode's dev-only mount -> cleanup -> mount cycle,
      // which runs this component's unmount effects (calling dispose()
      // below) once "for practice" on the very first mount. Without this,
      // that one throwaway dispose() would permanently disconnect tab-hidden
      // muting for the rest of the session, even though the AudioContext
      // itself recovers fine (ensure() already tolerates a null ctx).
      document.addEventListener('visibilitychange', this.onVisibilityChange)
      this.hidden = document.hidden
    }
    if (this.ctx) {
      // Browsers suspend the context until a user gesture; a click on the
      // toggle counts. Never resume into a hidden tab.
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume()
      return this.ctx
    }
    if (typeof AudioContext === 'undefined') return null
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0
    const limiter = this.ctx.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.1
    this.master.connect(limiter)
    limiter.connect(this.ctx.destination)
    this.applyGain()
    return this.ctx
  }
}
