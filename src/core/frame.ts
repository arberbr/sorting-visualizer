import { emptyCounts, type Counts, type Step } from './types'

/** Everything a renderer needs to draw one moment of a run. */
export interface FrameState {
  index: number
  main: Float64Array
  aux: Float64Array | null
  sorted: Uint8Array
  /** -1 when no pivot is marked. */
  pivot: number
  range: [number, number] | null
  lastCompare: Int32Array
  lastWrite: Int32Array
  counts: Counts
}

const NEVER = -1_000_000

export function createInitialState(input: readonly number[], auxLength: number): FrameState {
  const n = input.length
  return {
    index: 0,
    main: Float64Array.from(input),
    aux: auxLength > 0 ? new Float64Array(auxLength) : null,
    sorted: new Uint8Array(n),
    pivot: -1,
    range: null,
    lastCompare: new Int32Array(n).fill(NEVER),
    lastWrite: new Int32Array(n).fill(NEVER),
    counts: emptyCounts(),
  }
}

/** Applies one step in place. The step's own index is the pre-increment value. */
export function applyStep(s: FrameState, step: Step): void {
  const at = s.index
  switch (step.t) {
    case 'read':
      s.counts.reads++
      if (step.lane === 0) s.lastCompare[step.i] = at
      break
    case 'write':
      s.counts.writes++
      if (step.lane === 0) {
        s.main[step.i] = step.value
        s.lastWrite[step.i] = at
      } else if (s.aux) {
        s.aux[step.i] = step.value
      }
      break
    case 'compare':
      s.counts.compares++
      if (step.lane === 0) {
        s.lastCompare[step.i] = at
        s.lastCompare[step.j] = at
      }
      break
    case 'compare-value':
      s.counts.compares++
      if (step.lane === 0) s.lastCompare[step.i] = at
      break
    case 'swap': {
      s.counts.swaps++
      if (step.lane === 0) {
        const tmp = s.main[step.i]
        s.main[step.i] = s.main[step.j]
        s.main[step.j] = tmp
        s.lastWrite[step.i] = at
        s.lastWrite[step.j] = at
      }
      break
    }
    case 'mark':
      switch (step.kind) {
        case 'pivot':
          s.pivot = step.indices[0] ?? -1
          break
        case 'range':
          s.range = [step.indices[0], step.indices[1]]
          break
        case 'sorted':
          for (const i of step.indices) s.sorted[i] = 1
          break
        case 'clear':
          s.pivot = -1
          s.range = null
          break
      }
      break
  }
  s.index = at + 1
}
