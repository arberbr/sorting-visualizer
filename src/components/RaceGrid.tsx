import { useEffect, useRef } from 'react'
import type { RaceEngine } from '../player/raceEngine'
import { getRenderer, type RenderStyle } from '../render'
import type { Theme } from '../render/theme'
import { formatCount } from './Telemetry'

interface Props {
  race: RaceEngine
  style: RenderStyle
  theme: Theme
}

/**
 * Race mode's stage: one canvas per lane, all painted from a single shared
 * RaceEngine. Deliberately does not reuse Canvas.tsx (that component owns
 * exactly one canvas bound to one engine) but matches its correctness
 * properties: device-pixel-ratio sizing, a ResizeObserver on the host, and
 * symmetric cleanup — the observer is disconnected and the engine
 * subscription torn down together.
 */
export default function RaceGrid({ race, style, theme }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>())
  const statsRef = useRef(new Map<string, HTMLSpanElement>())

  useEffect(() => {
    const draw = getRenderer(style)
    const dpr = window.devicePixelRatio || 1

    const paintAll = () => {
      for (const lane of race.lanes) {
        const canvas = canvasRefs.current.get(lane.id)
        if (!canvas) continue
        const parent = canvas.parentElement!
        const width = parent.clientWidth
        const height = parent.clientHeight
        // Both dimensions must be checked, not just width: the grid always
        // has 2 columns, so going from 2 to 3+ lanes changes a lane's row
        // height (1 row -> 2 rows) while its column width stays the same. A
        // width-only check would then skip the resize entirely, leaving the
        // canvas's old, too-tall backing store and CSS height in place — it
        // would visually overflow into the grid row below it.
        if (
          canvas.width !== Math.round(width * dpr) ||
          canvas.height !== Math.round(height * dpr)
        ) {
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
        }
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        draw(ctx, lane.engine.frame, theme, { width, height })

        const stats = statsRef.current.get(lane.id)
        if (stats) {
          const c = lane.engine.frame.counts
          const done = lane.engine.atEnd ? ` · finished at ${formatCount(lane.engine.total)}` : ''
          stats.textContent = `cmp ${formatCount(c.compares)} · swp ${formatCount(c.swaps)}${done}`
        }
      }
    }

    const observer = new ResizeObserver(paintAll)
    if (hostRef.current) observer.observe(hostRef.current)
    const off = race.onFrame(paintAll)
    paintAll()
    return () => {
      observer.disconnect()
      off()
    }
  }, [race, style, theme])

  return (
    <div className="race" ref={hostRef} data-lanes={race.lanes.length}>
      {race.lanes.map((lane) => (
        <div className="race__lane panel" key={lane.id}>
          <div className="race__head">
            <span className="race__name">{lane.label}</span>
            <span
              className="race__stats num"
              ref={(el) => {
                if (el) statsRef.current.set(lane.id, el)
                else statsRef.current.delete(lane.id)
              }}
            />
          </div>
          <div className="race__plot">
            <canvas
              style={{ display: 'block' }}
              ref={(el) => {
                if (el) canvasRefs.current.set(lane.id, el)
                else canvasRefs.current.delete(lane.id)
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
