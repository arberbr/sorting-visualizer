/** Steps per second offered by the speed control. The last is "as fast as it draws". */
export const SPEEDS: readonly number[] = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 50_000]

/** Beyond this, a single frame's work starts to feel like a hang. */
export const MAX_STEPS_PER_FRAME = 50_000

/** Converts elapsed wall-clock time into a whole number of steps, carrying the remainder. */
export function advance(
  dtMs: number,
  stepsPerSecond: number,
  carry: number,
  remaining: number,
): { steps: number; carry: number } {
  if (stepsPerSecond <= 0 || remaining <= 0) return { steps: 0, carry: 0 }
  const wanted = carry + (dtMs / 1000) * stepsPerSecond
  const whole = Math.floor(wanted)
  const steps = Math.min(whole, remaining, MAX_STEPS_PER_FRAME)
  return { steps, carry: wanted - whole }
}
