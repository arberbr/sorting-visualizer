import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest is configured with `globals: false`, so testing-library's automatic
// afterEach(cleanup) — which only registers itself when it can see a global
// test-framework hook — never fires. Without this, DOM nodes from one
// component test leak into the next test in the same file and queries like
// getByTestId start matching more than one element.
afterEach(() => {
  cleanup()
})
