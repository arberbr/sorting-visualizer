import { drawBars } from './bars'
import type { Renderer } from './layout'

export type RenderStyle = 'bars' | 'dots' | 'rainbow' | 'pyramid'

export const RENDERERS: ReadonlyArray<{ id: RenderStyle; label: string; draw: Renderer }> = [
  { id: 'bars', label: 'Bars', draw: drawBars },
]

export function getRenderer(id: RenderStyle): Renderer {
  return (RENDERERS.find((r) => r.id === id) ?? RENDERERS[0]).draw
}

export type { Renderer, Size, PlotArea } from './layout'
