export interface Theme {
  bg: string
  surface: string
  surfaceAlt: string
  hairline: string
  text: string
  muted: string
  idle: string
  read: string
  compare: string
  swap: string
  pivot: string
  sorted: string
  aux: string
  accent: string
  danger: string
}

/** The dark technical instrument. Semantic roles only — nothing here is decorative. */
export const DARK: Theme = {
  bg: '#0a0b0f',
  surface: '#101218',
  surfaceAlt: '#161922',
  hairline: 'rgba(255, 255, 255, 0.08)',
  text: '#e6e8ee',
  muted: '#868c9e',
  idle: '#4a5164',
  read: '#8d97b5',
  compare: '#f5b642',
  swap: '#f2537d',
  pivot: '#a06bff',
  sorted: '#37d399',
  aux: '#38bdf8',
  accent: '#a06bff',
  danger: '#ff6b6b',
}

export function cssVarName(key: keyof Theme): string {
  return `--c-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** Mirrors the palette into CSS custom properties so the DOM and canvas cannot drift. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(cssVarName(key as keyof Theme), value)
  }
}
