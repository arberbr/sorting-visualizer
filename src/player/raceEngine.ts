import type { PlayerEngine } from './engine'
import { advance } from './timing'

export interface Lane {
  id: string
  label: string
  engine: PlayerEngine
}

/** One shared step index driving several traces over the same input. */
export class RaceEngine {
  private position = 0
  private carry = 0
  private subscribers = new Set<() => void>()

  constructor(readonly lanes: readonly Lane[]) {}

  get index(): number {
    return this.position
  }

  get total(): number {
    return this.lanes.reduce((max, l) => Math.max(max, l.engine.total), 0)
  }

  get finished(): boolean {
    return this.position >= this.total
  }

  seek(index: number): void {
    const target = Math.max(0, Math.min(index, this.total))
    if (target === this.position) return
    this.position = target
    // A lane shorter than the shared index simply holds its final state.
    for (const lane of this.lanes) lane.engine.seek(Math.min(target, lane.engine.total))
    this.carry = 0
    this.emit()
  }

  stepBy(n: number): void {
    this.seek(this.position + n)
  }

  tick(dtMs: number, stepsPerSecond: number): void {
    const { steps, carry } = advance(dtMs, stepsPerSecond, this.carry, this.total - this.position)
    this.carry = carry
    if (steps <= 0) return
    this.seek(this.position + steps)
    this.carry = carry
  }

  onFrame(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private emit(): void {
    for (const cb of this.subscribers) cb()
  }
}
