import { useEffect, useRef } from 'react'
import type { PlayerEngine } from '../player/engine'
import { getRenderer, type RenderStyle } from '../render'
import type { Theme } from '../render/theme'

interface Props {
  engine: PlayerEngine | null
  style: RenderStyle
  theme: Theme
}

/**
 * Owns the drawing surface. React renders this element once; every frame after
 * that is painted imperatively from the engine, never through a re-render.
 */
export default function Canvas({ engine, style, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement!
    const ctx = canvas.getContext('2d')!
    const draw = getRenderer(style)

    const paint = () => {
      if (!engine) {
        ctx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height)
        return
      }
      draw(ctx, engine.frame, theme, sizeRef.current)
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = parent.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { width, height }
      paint()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    resize()

    const off = engine?.onFrame(paint)
    return () => {
      observer.disconnect()
      off?.()
    }
  }, [engine, style, theme])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
