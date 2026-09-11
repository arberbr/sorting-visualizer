import { useEffect, useRef } from 'react'

export interface KeyHandlers {
  onToggle(): void
  onStep(delta: number): void
  onStart(): void
  onEnd(): void
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useKeyboard(handlers: KeyHandlers): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // The code editor and every form control keep their own key handling.
      if (target && (TYPING.has(target.tagName) || target.isContentEditable)) return
      if (target?.closest?.('.cm-editor')) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          ref.current.onToggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          ref.current.onStep(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          ref.current.onStep(-1)
          break
        case 'Home':
          ref.current.onStart()
          break
        case 'End':
          ref.current.onEnd()
          break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
