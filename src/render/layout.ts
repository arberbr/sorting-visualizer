import type { FrameState } from '../core/frame'
import type { Theme } from './theme'

export interface PlotArea {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  width: number
  height: number
}

export type Renderer = (
  ctx: CanvasRenderingContext2D,
  frame: FrameState,
  theme: Theme,
  size: Size,
) => void

const PAD = 12
const AUX_FRACTION = 0.26
const LANE_GAP = 10

export function splitLanes(size: Size, hasAux: boolean): { main: PlotArea; aux: PlotArea | null } {
  const x = PAD
  const w = Math.max(1, size.width - PAD * 2)
  const usable = Math.max(1, size.height - PAD * 2)

  if (!hasAux) {
    return { main: { x, y: PAD, w, h: usable }, aux: null }
  }
  const auxH = Math.round(usable * AUX_FRACTION)
  const mainH = usable - auxH - LANE_GAP
  return {
    main: { x, y: PAD, w, h: mainH },
    aux: { x, y: PAD + mainH + LANE_GAP, w, h: auxH },
  }
}

export function barMetrics(
  area: PlotArea,
  n: number,
): { barWidth: number; gap: number; slot: number } {
  if (n <= 0) return { barWidth: 0, gap: 0, slot: 0 }
  const slot = area.w / n
  // Below ~3px per element a gap costs more than it communicates.
  const gap = slot >= 3 ? Math.min(2, slot * 0.18) : 0
  return { barWidth: Math.max(1, slot - gap), gap, slot }
}

/** How recently element `i` was touched: 1 at the touch, 0 once DECAY_STEPS have passed. */
export const DECAY_STEPS = 24

export function heat(index: number, lastTouched: number): number {
  const age = index - lastTouched
  if (age < 0 || age >= DECAY_STEPS) return 0
  return 1 - age / DECAY_STEPS
}

/** The single place that decides what color an element is. */
export function elementColor(i: number, frame: FrameState, theme: Theme): string {
  if (i === frame.pivot) return theme.pivot
  const write = heat(frame.index, frame.lastWrite[i])
  if (write > 0) return mix(theme.idle, theme.swap, 0.35 + 0.65 * write)
  const cmp = heat(frame.index, frame.lastCompare[i])
  if (cmp > 0) return mix(theme.idle, theme.compare, 0.35 + 0.65 * cmp)
  // A plain read is activity, not a comparison. It decays exactly like the
  // others, but in its own quiet colour: the non-comparison family (counting
  // sort, radix, pigeonhole) is all reads and no compares, and painting those
  // amber claimed a comparison that never happened.
  const read = heat(frame.index, frame.lastRead[i])
  if (read > 0) return mix(theme.idle, theme.read, 0.35 + 0.65 * read)
  if (frame.sorted[i]) return theme.sorted
  if (frame.range && (i < frame.range[0] || i > frame.range[1])) return dim(theme.idle)
  return theme.idle
}

function mix(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * clamp01(t)))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function dim(color: string): string {
  const [r, g, b] = parseHex(color)
  return `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(b * 0.55)})`
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
