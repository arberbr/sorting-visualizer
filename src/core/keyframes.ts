import { applyStep, createInitialState, type FrameState } from './frame'
import type { Keyframe, Trace } from './runner'
import type { Step } from './types'

export const KEYFRAME_INTERVAL = 2000

export function buildKeyframes(
  input: readonly number[],
  steps: readonly Step[],
  auxLength: number,
  interval: number = KEYFRAME_INTERVAL,
): Keyframe[] {
  const s = createInitialState(input, auxLength)
  const frames: Keyframe[] = [snapshot(s)]
  for (let i = 0; i < steps.length; i++) {
    applyStep(s, steps[i])
    if (s.index % interval === 0) frames.push(snapshot(s))
  }
  return frames
}

/**
 * State after `index` steps. Restores the nearest preceding keyframe and
 * replays forward, so both the work and the memory per seek are bounded.
 */
export function stateAt(trace: Trace, index: number): FrameState {
  const target = Math.max(0, Math.min(index, trace.steps.length))
  const kf = nearest(trace.keyframes, target)
  const s = restore(trace, kf)
  for (let i = kf.index; i < target; i++) applyStep(s, trace.steps[i])
  return s
}

function nearest(keyframes: readonly Keyframe[], index: number): Keyframe {
  let lo = 0
  let hi = keyframes.length - 1
  let best = keyframes[0]
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (keyframes[mid].index <= index) {
      best = keyframes[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

function restore(trace: Trace, kf: Keyframe): FrameState {
  const s = createInitialState(trace.input, trace.auxLength)
  s.main.set(kf.main)
  if (s.aux && kf.aux) s.aux.set(kf.aux)
  s.sorted.set(kf.sorted)
  s.counts = { ...kf.counts }
  s.index = kf.index
  s.pivot = kf.pivot
  // Copied, not aliased, in both directions (see snapshot below): a keyframe
  // is read many times and must never share a mutable tuple with the live
  // state that replays on top of it.
  s.range = kf.range ? [kf.range[0], kf.range[1]] : null
  s.lastCompare.set(kf.lastCompare)
  s.lastRead.set(kf.lastRead)
  s.lastWrite.set(kf.lastWrite)
  return s
}

function snapshot(s: FrameState): Keyframe {
  return {
    index: s.index,
    main: Float64Array.from(s.main),
    aux: s.aux ? Float64Array.from(s.aux) : null,
    counts: { ...s.counts },
    sorted: Uint8Array.from(s.sorted),
    pivot: s.pivot,
    range: s.range ? [s.range[0], s.range[1]] : null,
    lastCompare: Int32Array.from(s.lastCompare),
    lastRead: Int32Array.from(s.lastRead),
    lastWrite: Int32Array.from(s.lastWrite),
  }
}
