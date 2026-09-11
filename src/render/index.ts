import { drawBars } from './bars'
import { drawDots } from './dots'
import type { Renderer } from './layout'
import { drawPyramid } from './pyramid'
import { drawRainbow } from './rainbow'

export type RenderStyle = 'bars' | 'dots' | 'rainbow' | 'pyramid'

export const RENDERERS: ReadonlyArray<{ id: RenderStyle; label: string; draw: Renderer }> = [
  { id: 'bars', label: 'Bars', draw: drawBars },
  { id: 'dots', label: 'Dots', draw: drawDots },
  { id: 'rainbow', label: 'Rainbow', draw: drawRainbow },
  { id: 'pyramid', label: 'Pyramid', draw: drawPyramid },
]

export function getRenderer(id: RenderStyle): Renderer {
  return (RENDERERS.find((r) => r.id === id) ?? RENDERERS[0]).draw
}

export type { PlotArea, Renderer, Size } from './layout'
