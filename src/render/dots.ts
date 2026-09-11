import { barMetrics, elementColor, splitLanes, type Renderer } from './layout'

/** One dot per element, positioned by value. A permutation scatter plot. */
export const drawDots: Renderer = (ctx, frame, theme, size) => {
  ctx.clearRect(0, 0, size.width, size.height)
  const { main } = splitLanes(size, false)
  const n = frame.main.length
  if (n === 0) return

  let max = 1
  for (let i = 0; i < n; i++) if (frame.main[i] > max) max = frame.main[i]

  const m = barMetrics(main, n)
  const radius = Math.max(1, Math.min(4, m.slot * 0.4))

  for (let i = 0; i < n; i++) {
    const cx = main.x + i * m.slot + m.slot / 2
    const cy = main.y + main.h - (frame.main[i] / max) * main.h
    ctx.fillStyle = elementColor(i, frame, theme)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}
