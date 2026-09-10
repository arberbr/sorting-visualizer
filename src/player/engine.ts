import { applyStep, type FrameState } from '../core/frame'
import { stateAt } from '../core/keyframes'
import type { Trace } from '../core/runner'
import { advance } from './timing'

/**
 * Walks a trace. Forward motion applies steps incrementally; anything else
 * restores the nearest keyframe. Framework-free so it can be tested directly.
 */
export class PlayerEngine {
  private state: FrameState
  private carry = 0
  private subscribers = new Set<(f: FrameState) => void>()

  constructor(readonly trace: Trace) {
    this.state = stateAt(trace, 0)
  }

  get frame(): FrameState {
    return this.state
  }

  get index(): number {
    return this.state.index
  }

  get total(): number {
    return this.trace.steps.length
  }

  get atEnd(): boolean {
    return this.state.index >= this.total
  }

  seek(index: number): void {
    const target = clamp(index, 0, this.total)
    if (target === this.state.index) return
    if (target > this.state.index) {
      this.applyForward(target - this.state.index)
    } else {
      this.state = stateAt(this.trace, target)
    }
    this.carry = 0
    this.emit()
  }

  stepBy(n: number): void {
    this.seek(this.state.index + n)
  }

  /** Advances by however many steps `dtMs` buys at `stepsPerSecond`. */
  tick(dtMs: number, stepsPerSecond: number): void {
    const remaining = this.total - this.state.index
    const { steps, carry } = advance(dtMs, stepsPerSecond, this.carry, remaining)
    this.carry = carry
    if (steps <= 0) return
    this.applyForward(steps)
    this.emit()
  }

  onFrame(cb: (f: FrameState) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private applyForward(count: number): void {
    const end = Math.min(this.state.index + count, this.total)
    for (let i = this.state.index; i < end; i++) applyStep(this.state, this.trace.steps[i])
  }

  private emit(): void {
    for (const cb of this.subscribers) cb(this.state)
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
