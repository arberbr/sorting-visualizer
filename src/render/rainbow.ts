import { barMetrics, heat, type Renderer, splitLanes } from './layout'

/**
 * Hue encodes value, so a sorted array is a clean spectrum sweep and any
 * remaining disorder shows up as a visible tear in the gradient.
 */
export const drawRainbow: Renderer = (ctx, frame, theme, size) => {
  ctx.clearRect(0, 0, size.width, size.height)
  const { main } = splitLanes(size, false)
  const n = frame.main.length
  if (n === 0) return

  let max = 1
  for (let i = 0; i < n; i++) if (frame.main[i] > max) max = frame.main[i]

  const m = barMetrics(main, n)
  for (let i = 0; i < n; i++) {
    const hue = Math.round((frame.main[i] / max) * 330)
    const touched = Math.max(
      heat(frame.index, frame.lastWrite[i]),
      heat(frame.index, frame.lastCompare[i]),
      heat(frame.index, frame.lastRead[i]),
    )
    const light = 45 + touched * 35
    ctx.fillStyle = `hsl(${hue}, 78%, ${light}%)`
    ctx.fillRect(main.x + i * m.slot, main.y, Math.max(1, m.slot), main.h)
  }

  if (frame.pivot >= 0) {
    ctx.fillStyle = theme.text
    ctx.fillRect(main.x + frame.pivot * m.slot, main.y, Math.max(1, m.slot), 3)
  }
}
