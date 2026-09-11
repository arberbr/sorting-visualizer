export const MIN_HZ = 160
export const MAX_HZ = 640
/** Simultaneous voices. More than this during fast playback is just noise. */
export const MAX_VOICES = 6
export const NOTE_MS = 55

/** Linear in value, which reads as a rising sweep when the array sorts. */
export function pitchFor(value: number, max: number): number {
  if (!(max > 0)) return MIN_HZ
  const t = Math.max(0, Math.min(1, value / max))
  return MIN_HZ + t * (MAX_HZ - MIN_HZ)
}
