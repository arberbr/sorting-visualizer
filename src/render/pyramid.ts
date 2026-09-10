import { barMetrics, elementColor, splitLanes, type Renderer } from './layout'

/** Bars centred vertically, growing in both directions — disorder reads as jaggedness. */
export const drawPyramid: Renderer = (ctx, frame, theme, size) => {
  ctx.clearRect(0, 0, size.width, size.height)
  const { main } = splitLanes(size, false)
  const n = frame.main.length
  if (n === 0) return

  let max = 1
  for (let i = 0; i < n; i++) if (frame.main[i] > max) max = frame.main[i]

  const m = barMetrics(main, n)
  const mid = main.y + main.h / 2

  for (let i = 0; i < n; i++) {
    const half = Math.max(0.5, (frame.main[i] / max) * (main.h / 2))
    ctx.fillStyle = elementColor(i, frame, theme)
    ctx.fillRect(main.x + i * m.slot, mid - half, m.barWidth, half * 2)
  }

  ctx.fillStyle = theme.hairline
  ctx.fillRect(main.x, mid, main.w, 1)
}
