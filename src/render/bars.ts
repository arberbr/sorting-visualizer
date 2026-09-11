import { barMetrics, elementColor, type Renderer, splitLanes } from './layout'

export const drawBars: Renderer = (ctx, frame, theme, size) => {
  ctx.clearRect(0, 0, size.width, size.height)

  const { main, aux } = splitLanes(size, frame.aux !== null)
  const n = frame.main.length
  if (n === 0) return

  let max = 1
  for (let i = 0; i < n; i++) if (frame.main[i] > max) max = frame.main[i]

  const m = barMetrics(main, n)
  for (let i = 0; i < n; i++) {
    const h = Math.max(1, (frame.main[i] / max) * main.h)
    const x = main.x + i * m.slot
    const y = main.y + main.h - h
    ctx.fillStyle = elementColor(i, frame, theme)
    ctx.fillRect(x, y, m.barWidth, h)
    // A single-pixel top edge gives the bars a crisp instrument feel without gradients.
    if (m.barWidth >= 3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
      ctx.fillRect(x, y, m.barWidth, 1)
    }
  }

  if (aux && frame.aux) {
    const an = frame.aux.length
    let amax = 1
    for (let i = 0; i < an; i++) if (frame.aux[i] > amax) amax = frame.aux[i]
    const am = barMetrics(aux, an)
    ctx.fillStyle = theme.aux
    ctx.globalAlpha = 0.75
    for (let i = 0; i < an; i++) {
      if (frame.aux[i] === 0) continue
      const h = Math.max(1, (frame.aux[i] / amax) * aux.h)
      ctx.fillRect(aux.x + i * am.slot, aux.y + aux.h - h, am.barWidth, h)
    }
    ctx.globalAlpha = 1
  }
}
