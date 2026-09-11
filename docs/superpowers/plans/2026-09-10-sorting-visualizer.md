# Sorting Algorithm Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser app that animates ~28 built-in sorting algorithms and any sorting function the user writes in JavaScript, using one shared execution and playback pipeline.

**Architecture:** Every algorithm — built-in or user-supplied — runs inside a Web Worker against an instrumented `TrackedArray` that records a flat `Step[]` trace. The UI is a pure function of `(trace, stepIndex)`: a player hook walks the index, a frame-state reducer applies steps, and canvas renderers draw the result. Data flows one way and nothing in `core/` knows the DOM exists.

**Tech Stack:** Vite, React 18, TypeScript (strict), Canvas 2D, Web Workers, CodeMirror 6, Web Audio API, Vitest (+ jsdom for component tests), hand-written CSS with design tokens.

**Spec:** `docs/superpowers/specs/2026-09-10-sorting-visualizer-design.md`

## Global Constraints

- **Step budget:** `maxSteps: 2_000_000`, `maxMillis: 5_000`. Exceeding either aborts the run with a structured error.
- **Keyframe interval:** a full array snapshot every `2000` steps.
- **Array size range:** 8 to 1000. Sizes above 400 show a warning that O(n²) algorithms may hit the step cap.
- **All execution goes through the Worker.** The main thread never calls `runSort` in production code (tests may call it directly).
- **`core/` imports nothing from React, the DOM, or any other `src/` unit.** Enforced by review, not tooling.
- **Built-in algorithms are written against the exact same `TrackedArray` API the user writes against.** No privileged internal methods.
- **TypeScript `strict: true`.** No `any` in committed code except where an external type demands it.
- **Design tokens are the only source of color.** No hex literals outside `src/styles/tokens.css` and `src/render/theme.ts`.
- **Ground color:** `#0a0b0f`. **Semantic colors:** idle slate, compare amber, swap/write rose, pivot violet, sorted emerald, aux cyan (exact values fixed in Task 13).
- **Fonts:** JetBrains Mono for all numerics, labels, and code; Inter for prose and headings.
- **Audio is off by default.**
- **Out of scope:** HTML/CSS editing, snippet libraries, URL sharing, server, accounts, light theme.

## Spec Reconciliations

Three details are refined from the spec. They are deliberate; implement the plan's version.

1. **Auxiliary buffers use a `lane` field on every step** (`0` = main array, `1` = aux) rather than the spec's `'aux'` mark kind. Marks stay purely semantic (`pivot`, `sorted`, `range`, `clear`).
2. **`incorrect` is not a `RunError`.** A run that terminates but leaves the array unsorted returns `ok: true` with `sorted: false` and `firstUnsorted`, because the spec requires the trace to still play. Correctness is a property of a successful result.
3. **`compare` returns `-1 | 0 | 1`**, not a raw difference — predictable for user code and small in the trace.

## File Structure

```
src/
  core/                      no DOM, no React, no cross-unit imports
    types.ts                 Step, Lane, MarkKind, Counts, Trace, SortFn, AlgorithmMeta
    limits.ts                Limits, DEFAULT_LIMITS, LimitError, Budget
    trackedArray.ts          TrackedArray + AuxArray — the user-facing contract
    runner.ts                runSort(): fn + input -> RunResult
    frame.ts                 FrameState, createInitialState, applyStep
    keyframes.ts             buildKeyframes, stateAt
    generate.ts              seeded RNG + input distributions
  algorithms/
    index.ts                 registry assembled from impl/ via import.meta.glob
    families.ts              family ids, labels, display order
    source.ts                extractSortSource(raw)
    impl/*.ts                one file per algorithm: meta + sort
    conformance.test.ts      one harness proving every registered algorithm
  worker/
    protocol.ts              RunRequest / RunResponse types
    sortRunner.worker.ts     the only place sorts execute in production
    useRunner.ts             React hook wrapping the worker
  player/
    usePlayer.ts             index, playing, speed, direction; rAF accumulator
  render/
    theme.ts                 Theme type + the dark theme
    layout.ts                pure geometry (testable, no canvas)
    bars.ts  dots.ts  rainbow.ts  pyramid.ts
    index.ts                 Renderer interface + style registry
  components/
    Canvas.tsx               canvas element, DPR sizing, rAF draw loop
    Controls.tsx             transport + speed + scrubber
    Telemetry.tsx            counters, complexity, correctness chip
    AlgorithmPicker.tsx      grouped list with badges
    ArrayConfig.tsx          size, distribution, seed, render style
    CodePanel.tsx            CodeMirror editor + run button
    ApiReference.tsx         static TrackedArray contract table
    ErrorBanner.tsx          RunError rendering
    RaceGrid.tsx             2-4 synchronized panels
  audio/
    sonifier.ts              pooled oscillators, off by default
  styles/
    tokens.css  global.css
  App.tsx  main.tsx
```

---

### Task 1: Project scaffold and test runner

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev`, `npm run build`, `npm test`. All later tasks assume `npm test` runs Vitest over `src/**/*.test.ts(x)`.

- [ ] **Step 1: Scaffold by hand (do NOT run `npm create vite`)**

`npm create vite` prompts interactively in a non-empty directory and one of its
answers deletes existing files — `docs/` and the plan itself live here. Write the
files directly instead.

Create `package.json`:

```json
{
  "name": "sorting-visualizer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sorting Visualizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Create `src/main.tsx` (Task 13 replaces this):

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create `src/App.tsx` (Task 13 replaces this):

```tsx
export default function App() {
  return <div>Sorting Visualizer</div>
}
```

Then install, pinning nothing beyond what npm resolves:

```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install @codemirror/state @codemirror/view @codemirror/lang-javascript @codemirror/theme-one-dark @codemirror/commands codemirror
```

- [ ] **Step 2: Configure Vite and Vitest**

Create `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
```

The scripts and `"strict": true` are already in the files written in Step 1.

- [ ] **Step 3: Write the smoke test**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Verify the toolchain**

Run: `npm test`
Expected: 1 passed.

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react ts project with vitest"
```

---

### Task 2: Core types, budget, and TrackedArray

This is the heart of the project. `TrackedArray` is both the recording mechanism and the public API users write against, so its surface is a compatibility contract.

**Files:**
- Create: `src/core/types.ts`, `src/core/limits.ts`, `src/core/trackedArray.ts`
- Test: `src/core/trackedArray.test.ts`, `src/core/limits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Lane = 0 | 1`, `type MarkKind = 'pivot' | 'sorted' | 'range' | 'clear'`
  - `type Step` (5 variants, all carrying `lane` except `mark`)
  - `interface Counts { reads: number; writes: number; compares: number; swaps: number }`
  - `type SortFn = (arr: TrackedArray) => void`
  - `class Budget { constructor(limits: Limits, now?: () => number); tick(): void }`
  - `class LimitError extends Error { kind: 'timeout' | 'step-budget'; limit: number }`
  - `class TrackedArray` with `length`, `get`, `set`, `compare`, `compareValue`, `swap`, `alloc`, `markPivot`, `markSorted`, `markRange`, `clearMarks`, plus internals `steps`, `snapshot()`, `auxSnapshot()`
  - `interface AuxArray { readonly length: number; get(i: number): number; set(i: number, v: number): void }`

- [ ] **Step 1: Write the failing tests for Budget**

Create `src/core/limits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Budget, LimitError } from './limits'

describe('Budget', () => {
  it('allows exactly maxSteps ticks', () => {
    const b = new Budget({ maxSteps: 3, maxMillis: 1000 })
    b.tick()
    b.tick()
    b.tick()
    expect(() => b.tick()).toThrow(LimitError)
  })

  it('reports step-budget as the failure kind', () => {
    const b = new Budget({ maxSteps: 1, maxMillis: 1000 })
    b.tick()
    try {
      b.tick()
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(LimitError)
      expect((e as LimitError).kind).toBe('step-budget')
      expect((e as LimitError).limit).toBe(1)
    }
  })

  it('throws timeout once the clock passes the deadline', () => {
    let now = 0
    const b = new Budget({ maxSteps: 1_000_000, maxMillis: 50 }, () => now)
    // The clock is only sampled every 4096 ticks, so advance time then tick past a boundary.
    now = 1000
    expect(() => {
      for (let i = 0; i < 8192; i++) b.tick()
    }).toThrowError(/50ms/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/limits.test.ts`
Expected: FAIL — cannot find module `./limits`.

- [ ] **Step 3: Implement limits**

Create `src/core/limits.ts`:

```ts
export interface Limits {
  maxSteps: number
  maxMillis: number
}

export const DEFAULT_LIMITS: Limits = { maxSteps: 2_000_000, maxMillis: 5_000 }

export class LimitError extends Error {
  constructor(
    readonly kind: 'timeout' | 'step-budget',
    readonly limit: number,
  ) {
    super(
      kind === 'timeout'
        ? `Exceeded the ${limit}ms time limit`
        : `Exceeded the ${limit} step limit`,
    )
    this.name = 'LimitError'
  }
}

/** Counts recorded steps and aborts a run that exceeds its limits. */
export class Budget {
  private count = 0
  private readonly deadline: number

  constructor(
    private readonly limits: Limits,
    private readonly now: () => number = Date.now,
  ) {
    this.deadline = now() + limits.maxMillis
  }

  tick(): void {
    this.count++
    if (this.count > this.limits.maxSteps) {
      throw new LimitError('step-budget', this.limits.maxSteps)
    }
    // Sampling the clock every step is measurably slower than the sort itself.
    if ((this.count & 0xfff) === 0 && this.now() > this.deadline) {
      throw new LimitError('timeout', this.limits.maxMillis)
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/limits.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing tests for TrackedArray**

Create `src/core/trackedArray.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TrackedArray } from './trackedArray'
import { Budget, LimitError } from './limits'

const budget = () => new Budget({ maxSteps: 1000, maxMillis: 10_000 })

describe('TrackedArray', () => {
  it('exposes length and reads values without mutating them', () => {
    const a = new TrackedArray([5, 2, 9], budget())
    expect(a.length).toBe(3)
    expect(a.get(2)).toBe(9)
    expect(a.snapshot()).toEqual([5, 2, 9])
  })

  it('records a read step', () => {
    const a = new TrackedArray([5], budget())
    a.get(0)
    expect(a.steps).toEqual([{ t: 'read', lane: 0, i: 0 }])
  })

  it('records a write step and applies it', () => {
    const a = new TrackedArray([5], budget())
    a.set(0, 7)
    expect(a.snapshot()).toEqual([7])
    expect(a.steps).toEqual([{ t: 'write', lane: 0, i: 0, value: 7 }])
  })

  it('compare returns the sign of the difference and records it', () => {
    const a = new TrackedArray([3, 1, 3], budget())
    expect(a.compare(0, 1)).toBe(1)
    expect(a.compare(1, 0)).toBe(-1)
    expect(a.compare(0, 2)).toBe(0)
    expect(a.steps[0]).toEqual({ t: 'compare', lane: 0, i: 0, j: 1, result: 1 })
  })

  it('compareValue compares an element against a loose value', () => {
    const a = new TrackedArray([3], budget())
    expect(a.compareValue(0, 10)).toBe(-1)
    expect(a.steps).toEqual([{ t: 'read', lane: 0, i: 0 }])
  })

  it('swap exchanges elements and records a single swap step', () => {
    const a = new TrackedArray([1, 2], budget())
    a.swap(0, 1)
    expect(a.snapshot()).toEqual([2, 1])
    expect(a.steps).toEqual([{ t: 'swap', lane: 0, i: 0, j: 1 }])
  })

  it('derives counts from the steps it recorded', () => {
    const a = new TrackedArray([3, 1], budget())
    a.compare(0, 1)
    a.swap(0, 1)
    a.get(0)
    a.set(1, 4)
    expect(a.counts).toEqual({ reads: 1, writes: 1, compares: 1, swaps: 1 })
  })

  it('alloc creates a second lane that records against lane 1', () => {
    const a = new TrackedArray([1, 2], budget())
    const aux = a.alloc(2)
    aux.set(0, 9)
    expect(aux.get(0)).toBe(9)
    expect(aux.length).toBe(2)
    expect(a.steps).toEqual([
      { t: 'write', lane: 1, i: 0, value: 9 },
      { t: 'read', lane: 1, i: 0 },
    ])
    expect(a.auxSnapshot()).toEqual([9, 0])
  })

  it('aux compares record against lane 1 and count as comparisons', () => {
    const a = new TrackedArray([1, 2], budget())
    const aux = a.alloc(2)
    aux.set(0, 5)
    aux.set(1, 2)
    expect(aux.compare(0, 1)).toBe(1)
    expect(a.steps.at(-1)).toEqual({ t: 'compare', lane: 1, i: 0, j: 1, result: 1 })
    expect(a.counts.compares).toBe(1)
  })

  it('refuses a second alloc', () => {
    const a = new TrackedArray([1], budget())
    a.alloc(1)
    expect(() => a.alloc(1)).toThrow(/once per run/)
  })

  it('records marks without touching data', () => {
    const a = new TrackedArray([1, 2, 3], budget())
    a.markPivot(1)
    a.markSorted(0, 2)
    a.markRange(0, 2)
    a.clearMarks()
    expect(a.steps).toEqual([
      { t: 'mark', kind: 'pivot', indices: [1] },
      { t: 'mark', kind: 'sorted', indices: [0, 2] },
      { t: 'mark', kind: 'range', indices: [0, 2] },
      { t: 'mark', kind: 'clear', indices: [] },
    ])
    expect(a.counts).toEqual({ reads: 0, writes: 0, compares: 0, swaps: 0 })
  })

  it('throws a RangeError on an out-of-bounds index', () => {
    const a = new TrackedArray([1], budget())
    expect(() => a.get(5)).toThrow(RangeError)
    expect(() => a.set(-1, 0)).toThrow(RangeError)
  })

  it('stops a runaway program via the budget', () => {
    const a = new TrackedArray([1, 2], new Budget({ maxSteps: 4, maxMillis: 10_000 }))
    expect(() => {
      for (let i = 0; i < 100; i++) a.get(0)
    }).toThrow(LimitError)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/core/trackedArray.test.ts`
Expected: FAIL — cannot find module `./trackedArray`.

- [ ] **Step 7: Implement the core types**

Create `src/core/types.ts`:

```ts
import type { TrackedArray } from './trackedArray'

/** 0 = the main array, 1 = the auxiliary buffer. */
export type Lane = 0 | 1

export type MarkKind = 'pivot' | 'sorted' | 'range' | 'clear'

export type Step =
  | { t: 'read'; lane: Lane; i: number }
  | { t: 'write'; lane: Lane; i: number; value: number }
  | { t: 'compare'; lane: Lane; i: number; j: number; result: -1 | 0 | 1 }
  | { t: 'swap'; lane: Lane; i: number; j: number }
  | { t: 'mark'; kind: MarkKind; indices: number[] }

export interface Counts {
  reads: number
  writes: number
  compares: number
  swaps: number
}

export const emptyCounts = (): Counts => ({ reads: 0, writes: 0, compares: 0, swaps: 0 })

export type SortFn = (arr: TrackedArray) => void

export type Family =
  | 'exchange'
  | 'insertion'
  | 'selection'
  | 'divide-and-conquer'
  | 'non-comparison'
  | 'network'
  | 'curiosity'

export interface AlgorithmMeta {
  id: string
  name: string
  family: Family
  best: string
  average: string
  worst: string
  space: string
  stable: boolean
  inPlace: boolean
  description: string
  /** Hard cap on array size for algorithms that would otherwise never finish. */
  maxN?: number
}
```

- [ ] **Step 8: Implement TrackedArray**

Create `src/core/trackedArray.ts`:

```ts
import { Budget } from './limits'
import { emptyCounts, type Counts, type Lane, type MarkKind, type Step } from './types'

export interface AuxArray {
  readonly length: number
  get(i: number): number
  set(i: number, v: number): void
  /** Compares two elements of the auxiliary buffer. Merge sort needs this. */
  compare(i: number, j: number): -1 | 0 | 1
}

/**
 * The array every sorting function operates on — built-in and user-written alike.
 * Every operation appends a Step, and those Steps are the entire animation.
 */
export class TrackedArray {
  readonly length: number
  readonly steps: Step[] = []

  private readonly data: Float64Array
  private aux: Float64Array | null = null
  private readonly counters: Counts = emptyCounts()

  constructor(input: readonly number[], private readonly budget: Budget) {
    this.data = Float64Array.from(input)
    this.length = input.length
  }

  get counts(): Counts {
    return { ...this.counters }
  }

  get auxLength(): number {
    return this.aux ? this.aux.length : 0
  }

  snapshot(): number[] {
    return Array.from(this.data)
  }

  auxSnapshot(): number[] {
    return this.aux ? Array.from(this.aux) : []
  }

  get(i: number): number {
    this.bounds(i, this.length)
    this.record({ t: 'read', lane: 0, i })
    this.counters.reads++
    return this.data[i]
  }

  set(i: number, v: number): void {
    this.bounds(i, this.length)
    this.record({ t: 'write', lane: 0, i, value: v })
    this.counters.writes++
    this.data[i] = v
  }

  /** Returns -1, 0 or 1 — the sign of data[i] - data[j]. */
  compare(i: number, j: number): -1 | 0 | 1 {
    this.bounds(i, this.length)
    this.bounds(j, this.length)
    const result = sign(this.data[i] - this.data[j])
    this.record({ t: 'compare', lane: 0, i, j, result })
    this.counters.compares++
    return result
  }

  /** Compares element i against a value held outside the array. */
  compareValue(i: number, v: number): -1 | 0 | 1 {
    return sign(this.get(i) - v)
  }

  swap(i: number, j: number): void {
    this.bounds(i, this.length)
    this.bounds(j, this.length)
    this.record({ t: 'swap', lane: 0, i, j })
    this.counters.swaps++
    const tmp = this.data[i]
    this.data[i] = this.data[j]
    this.data[j] = tmp
  }

  /** Allocates the auxiliary buffer. One per run; calling twice throws. */
  alloc(n: number): AuxArray {
    if (this.aux) throw new Error('alloc() may only be called once per run')
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`Bad aux length: ${n}`)
    this.aux = new Float64Array(n)
    const self = this
    return {
      get length() {
        return n
      },
      get(i: number): number {
        self.bounds(i, n)
        self.record({ t: 'read', lane: 1, i })
        self.counters.reads++
        return self.aux![i]
      },
      set(i: number, v: number): void {
        self.bounds(i, n)
        self.record({ t: 'write', lane: 1, i, value: v })
        self.counters.writes++
        self.aux![i] = v
      },
      compare(i: number, j: number): -1 | 0 | 1 {
        self.bounds(i, n)
        self.bounds(j, n)
        const result = sign(self.aux![i] - self.aux![j])
        self.record({ t: 'compare', lane: 1, i, j, result })
        self.counters.compares++
        return result
      },
    }
  }

  markPivot(i: number): void {
    this.record({ t: 'mark', kind: 'pivot', indices: [i] })
  }

  markSorted(...indices: number[]): void {
    this.record({ t: 'mark', kind: 'sorted', indices })
  }

  markRange(lo: number, hi: number): void {
    this.record({ t: 'mark', kind: 'range', indices: [lo, hi] })
  }

  clearMarks(): void {
    this.mark('clear', [])
  }

  private mark(kind: MarkKind, indices: number[]): void {
    this.record({ t: 'mark', kind, indices })
  }

  private record(step: Step): void {
    this.budget.tick()
    this.steps.push(step)
  }

  private bounds(i: number, len: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= len) {
      throw new RangeError(`Index ${i} is outside 0..${len - 1}`)
    }
  }
}

function sign(d: number): -1 | 0 | 1 {
  return d < 0 ? -1 : d > 0 ? 1 : 0
}

export type { Lane }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/core/`
Expected: all passed.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/core package.json vite.config.ts
git commit -m "feat(core): add Step types, Budget, and TrackedArray"
```

---

### Task 3: The runner

**Files:**
- Create: `src/core/runner.ts`, `src/core/verify.ts`
- Test: `src/core/runner.test.ts`

**Interfaces:**
- Consumes: `TrackedArray`, `Budget`, `LimitError`, `Limits`, `DEFAULT_LIMITS`, `Step`, `Counts`.
- Produces:
  - `interface Trace { input: number[]; steps: Step[]; auxLength: number; counts: Counts; keyframes: Keyframe[] }` — `keyframes` is populated in Task 4; this task emits `[]`.
  - `type RunError = { code: 'syntax' | 'runtime' | 'timeout' | 'step-budget' | 'not-a-function'; message: string; line?: number; limit?: number }`
  - `type RunResult = { ok: true; trace: Trace; finalArray: number[]; sorted: boolean; firstUnsorted: number } | { ok: false; error: RunError }`
  - `function runSort(sortFn: SortFn, input: readonly number[], limits?: Limits): RunResult`
  - `function checkSorted(a: readonly number[]): { sorted: boolean; firstUnsorted: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/core/runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runSort } from './runner'
import { checkSorted } from './verify'
import type { TrackedArray } from './trackedArray'

const bubble = (a: TrackedArray) => {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      if (a.compare(j, j + 1) > 0) a.swap(j, j + 1)
    }
  }
}

describe('checkSorted', () => {
  it('accepts sorted and empty arrays', () => {
    expect(checkSorted([])).toEqual({ sorted: true, firstUnsorted: -1 })
    expect(checkSorted([1, 1, 2, 3])).toEqual({ sorted: true, firstUnsorted: -1 })
  })

  it('reports the first index that breaks the order', () => {
    expect(checkSorted([1, 3, 2])).toEqual({ sorted: false, firstUnsorted: 2 })
  })
})

describe('runSort', () => {
  it('produces a trace and a sorted final array', () => {
    const r = runSort(bubble, [3, 1, 2])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([1, 2, 3])
    expect(r.sorted).toBe(true)
    expect(r.trace.input).toEqual([3, 1, 2])
    expect(r.trace.steps.length).toBeGreaterThan(0)
    expect(r.trace.counts.compares).toBeGreaterThan(0)
  })

  it('does not mutate the caller input array', () => {
    const input = [3, 1, 2]
    runSort(bubble, input)
    expect(input).toEqual([3, 1, 2])
  })

  it('succeeds but reports sorted: false for an incorrect algorithm', () => {
    const wrong = (a: TrackedArray) => {
      a.swap(0, 1)
    }
    const r = runSort(wrong, [1, 2, 3])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sorted).toBe(false)
    expect(r.firstUnsorted).toBe(1)
    expect(r.trace.steps).toHaveLength(1)
  })

  it('reports step-budget for an infinite loop', () => {
    const spin = (a: TrackedArray) => {
      for (;;) a.get(0)
    }
    const r = runSort(spin, [1, 2], { maxSteps: 500, maxMillis: 10_000 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('step-budget')
    expect(r.error.limit).toBe(500)
  })

  it('reports timeout when the clock runs out', () => {
    const slow = (a: TrackedArray) => {
      for (;;) a.get(0)
    }
    const r = runSort(slow, [1, 2], { maxSteps: 5_000_000, maxMillis: 1 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('timeout')
  })

  it('reports runtime errors thrown by the sort function', () => {
    const boom = () => {
      throw new TypeError('cannot read x of undefined')
    }
    const r = runSort(boom, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('runtime')
    expect(r.error.message).toContain('cannot read x of undefined')
  })

  it('reports not-a-function when handed something that is not callable', () => {
    const r = runSort(undefined as never, [1, 2])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('not-a-function')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/runner.test.ts`
Expected: FAIL — cannot find module `./runner`.

- [ ] **Step 3: Implement verify**

Create `src/core/verify.ts`:

```ts
/** Checks ascending order and reports where it first breaks. */
export function checkSorted(a: readonly number[]): { sorted: boolean; firstUnsorted: number } {
  for (let i = 1; i < a.length; i++) {
    if (a[i] < a[i - 1]) return { sorted: false, firstUnsorted: i }
  }
  return { sorted: true, firstUnsorted: -1 }
}
```

- [ ] **Step 4: Implement the runner**

Create `src/core/runner.ts`:

```ts
import { Budget, DEFAULT_LIMITS, LimitError, type Limits } from './limits'
import { TrackedArray } from './trackedArray'
import { checkSorted } from './verify'
import type { Counts, SortFn, Step } from './types'

export interface Keyframe {
  index: number
  main: Float64Array
  aux: Float64Array | null
  counts: Counts
  sorted: Uint8Array
}

export interface Trace {
  input: number[]
  steps: Step[]
  auxLength: number
  counts: Counts
  keyframes: Keyframe[]
}

export interface RunError {
  code: 'syntax' | 'runtime' | 'timeout' | 'step-budget' | 'not-a-function'
  message: string
  line?: number
  limit?: number
}

export type RunResult =
  | { ok: true; trace: Trace; finalArray: number[]; sorted: boolean; firstUnsorted: number }
  | { ok: false; error: RunError }

/**
 * Runs a sorting function against an instrumented copy of `input`.
 * Never throws: every failure mode comes back as a structured RunError.
 */
export function runSort(
  sortFn: SortFn,
  input: readonly number[],
  limits: Limits = DEFAULT_LIMITS,
): RunResult {
  if (typeof sortFn !== 'function') {
    return {
      ok: false,
      error: { code: 'not-a-function', message: 'No sort function was provided' },
    }
  }

  const arr = new TrackedArray(input, new Budget(limits))

  try {
    sortFn(arr)
  } catch (e) {
    if (e instanceof LimitError) {
      return { ok: false, error: { code: e.kind, message: e.message, limit: e.limit } }
    }
    const err = e as Error
    return {
      ok: false,
      error: { code: 'runtime', message: err?.message ?? String(e), line: lineOf(err) },
    }
  }

  const finalArray = arr.snapshot()
  const { sorted, firstUnsorted } = checkSorted(finalArray)

  return {
    ok: true,
    trace: {
      input: Array.from(input),
      steps: arr.steps,
      auxLength: arr.auxLength,
      counts: arr.counts,
      keyframes: [],
    },
    finalArray,
    sorted,
    firstUnsorted,
  }
}

/** Best-effort line number from a stack frame in dynamically compiled user code. */
function lineOf(err: Error): number | undefined {
  const m = /<anonymous>:(\d+):\d+/.exec(err?.stack ?? '')
  return m ? Number(m[1]) : undefined
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/core/`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/core
git commit -m "feat(core): add runSort with structured errors and correctness check"
```

---

### Task 4: Frame state, step application, and seeking

The player never re-runs an algorithm. It walks a trace forward one step at a time, and seeks by restoring the nearest keyframe and replaying forward from there.

**Files:**
- Create: `src/core/frame.ts`, `src/core/keyframes.ts`
- Modify: `src/core/runner.ts` (populate `trace.keyframes`)
- Test: `src/core/frame.test.ts`, `src/core/keyframes.test.ts`

**Interfaces:**
- Consumes: `Step`, `Counts`, `Trace`, `Keyframe`, `runSort`.
- Produces:
  - `interface FrameState { index: number; main: Float64Array; aux: Float64Array | null; sorted: Uint8Array; pivot: number; range: [number, number] | null; lastCompare: Int32Array; lastWrite: Int32Array; counts: Counts }`
  - `function createInitialState(input: readonly number[], auxLength: number): FrameState`
  - `function applyStep(s: FrameState, step: Step): void` — mutates, increments `s.index`
  - `const KEYFRAME_INTERVAL = 2000`
  - `function buildKeyframes(input: readonly number[], steps: readonly Step[], auxLength: number, interval?: number): Keyframe[]`
  - `function stateAt(trace: Trace, index: number): FrameState`

`pivot` is `-1` when there is none. `lastCompare` / `lastWrite` hold the step index at which each element of the main lane was last touched, initialised to `-1_000_000` so nothing highlights at step 0; renderers use `index - lastX[i]` to fade highlights out. They cover the main lane only — aux writes are drawn without decay.

- [ ] **Step 1: Write the failing tests for frame state**

Create `src/core/frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyStep, createInitialState } from './frame'
import type { Step } from './types'

const state = () => createInitialState([5, 3, 8], 0)

describe('applyStep', () => {
  it('starts from the input with nothing marked', () => {
    const s = state()
    expect(Array.from(s.main)).toEqual([5, 3, 8])
    expect(s.index).toBe(0)
    expect(s.pivot).toBe(-1)
    expect(s.range).toBeNull()
    expect(Array.from(s.sorted)).toEqual([0, 0, 0])
  })

  it('applies a write and counts it', () => {
    const s = state()
    applyStep(s, { t: 'write', lane: 0, i: 1, value: 9 })
    expect(Array.from(s.main)).toEqual([5, 9, 8])
    expect(s.counts.writes).toBe(1)
    expect(s.index).toBe(1)
    expect(s.lastWrite[1]).toBe(0)
  })

  it('applies a swap and marks both indices as written', () => {
    const s = state()
    applyStep(s, { t: 'swap', lane: 0, i: 0, j: 2 })
    expect(Array.from(s.main)).toEqual([8, 3, 5])
    expect(s.counts.swaps).toBe(1)
    expect(s.lastWrite[0]).toBe(0)
    expect(s.lastWrite[2]).toBe(0)
  })

  it('records compares against both indices without changing data', () => {
    const s = state()
    applyStep(s, { t: 'compare', lane: 0, i: 0, j: 1, result: 1 })
    expect(Array.from(s.main)).toEqual([5, 3, 8])
    expect(s.counts.compares).toBe(1)
    expect(s.lastCompare[0]).toBe(0)
    expect(s.lastCompare[1]).toBe(0)
  })

  it('applies aux-lane writes to the aux buffer only', () => {
    const s = createInitialState([1, 2], 2)
    applyStep(s, { t: 'write', lane: 1, i: 0, value: 7 })
    expect(Array.from(s.aux!)).toEqual([7, 0])
    expect(Array.from(s.main)).toEqual([1, 2])
  })

  it('applies marks', () => {
    const s = state()
    const steps: Step[] = [
      { t: 'mark', kind: 'pivot', indices: [2] },
      { t: 'mark', kind: 'range', indices: [0, 1] },
      { t: 'mark', kind: 'sorted', indices: [0, 2] },
    ]
    for (const step of steps) applyStep(s, step)
    expect(s.pivot).toBe(2)
    expect(s.range).toEqual([0, 1])
    expect(Array.from(s.sorted)).toEqual([1, 0, 1])

    applyStep(s, { t: 'mark', kind: 'clear', indices: [] })
    expect(s.pivot).toBe(-1)
    expect(s.range).toBeNull()
    expect(Array.from(s.sorted)).toEqual([1, 0, 1])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/frame.test.ts`
Expected: FAIL — cannot find module `./frame`.

- [ ] **Step 3: Implement frame state**

Create `src/core/frame.ts`:

```ts
import { emptyCounts, type Counts, type Step } from './types'

/** Everything a renderer needs to draw one moment of a run. */
export interface FrameState {
  index: number
  main: Float64Array
  aux: Float64Array | null
  sorted: Uint8Array
  /** -1 when no pivot is marked. */
  pivot: number
  range: [number, number] | null
  lastCompare: Int32Array
  lastWrite: Int32Array
  counts: Counts
}

const NEVER = -1_000_000

export function createInitialState(input: readonly number[], auxLength: number): FrameState {
  const n = input.length
  return {
    index: 0,
    main: Float64Array.from(input),
    aux: auxLength > 0 ? new Float64Array(auxLength) : null,
    sorted: new Uint8Array(n),
    pivot: -1,
    range: null,
    lastCompare: new Int32Array(n).fill(NEVER),
    lastWrite: new Int32Array(n).fill(NEVER),
    counts: emptyCounts(),
  }
}

/** Applies one step in place. The step's own index is the pre-increment value. */
export function applyStep(s: FrameState, step: Step): void {
  const at = s.index
  switch (step.t) {
    case 'read':
      s.counts.reads++
      if (step.lane === 0) s.lastCompare[step.i] = at
      break
    case 'write':
      s.counts.writes++
      if (step.lane === 0) {
        s.main[step.i] = step.value
        s.lastWrite[step.i] = at
      } else if (s.aux) {
        s.aux[step.i] = step.value
      }
      break
    case 'compare':
      s.counts.compares++
      if (step.lane === 0) {
        s.lastCompare[step.i] = at
        s.lastCompare[step.j] = at
      }
      break
    case 'swap': {
      s.counts.swaps++
      if (step.lane === 0) {
        const tmp = s.main[step.i]
        s.main[step.i] = s.main[step.j]
        s.main[step.j] = tmp
        s.lastWrite[step.i] = at
        s.lastWrite[step.j] = at
      }
      break
    }
    case 'mark':
      switch (step.kind) {
        case 'pivot':
          s.pivot = step.indices[0] ?? -1
          break
        case 'range':
          s.range = [step.indices[0], step.indices[1]]
          break
        case 'sorted':
          for (const i of step.indices) s.sorted[i] = 1
          break
        case 'clear':
          s.pivot = -1
          s.range = null
          break
      }
      break
  }
  s.index = at + 1
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/frame.test.ts`
Expected: all passed.

- [ ] **Step 5: Write the failing tests for keyframes**

Create `src/core/keyframes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runSort } from './runner'
import { buildKeyframes, stateAt } from './keyframes'
import { applyStep, createInitialState } from './frame'
import type { TrackedArray } from './trackedArray'

const bubble = (a: TrackedArray) => {
  for (let end = a.length - 1; end > 0; end--) {
    for (let i = 0; i < end; i++) if (a.compare(i, i + 1) > 0) a.swap(i, i + 1)
    a.markSorted(end)
  }
}

const traceOf = (n: number) => {
  const input = Array.from({ length: n }, (_, i) => (i * 7919) % n)
  const r = runSort(bubble, input)
  if (!r.ok) throw new Error('run failed')
  return r.trace
}

/** Independent reference implementation: replay from step 0 every time. */
const linearStateAt = (trace: ReturnType<typeof traceOf>, index: number) => {
  const s = createInitialState(trace.input, trace.auxLength)
  for (let i = 0; i < index; i++) applyStep(s, trace.steps[i])
  return s
}

describe('buildKeyframes', () => {
  it('always includes step 0 and spaces the rest by the interval', () => {
    const trace = traceOf(80)
    const kf = buildKeyframes(trace.input, trace.steps, trace.auxLength, 100)
    expect(kf[0].index).toBe(0)
    expect(kf[1].index).toBe(100)
    expect(kf.at(-1)!.index).toBeLessThanOrEqual(trace.steps.length)
  })
})

describe('stateAt', () => {
  it('matches a linear replay at arbitrary indices', () => {
    const trace = traceOf(60)
    const picks = [0, 1, 7, 999, 2001, Math.floor(trace.steps.length / 2), trace.steps.length]
    for (const index of picks) {
      const i = Math.min(index, trace.steps.length)
      const fast = stateAt(trace, i)
      const slow = linearStateAt(trace, i)
      expect(Array.from(fast.main)).toEqual(Array.from(slow.main))
      expect(Array.from(fast.sorted)).toEqual(Array.from(slow.sorted))
      expect(fast.counts).toEqual(slow.counts)
      expect(fast.index).toBe(i)
    }
  })

  it('gives the same answer seeking backwards as forwards', () => {
    const trace = traceOf(40)
    const mid = Math.floor(trace.steps.length / 2)
    const forward = stateAt(trace, mid)
    stateAt(trace, trace.steps.length)
    const backward = stateAt(trace, mid)
    expect(Array.from(backward.main)).toEqual(Array.from(forward.main))
  })

  it('clamps out-of-range indices', () => {
    const trace = traceOf(20)
    expect(stateAt(trace, -5).index).toBe(0)
    expect(stateAt(trace, trace.steps.length + 100).index).toBe(trace.steps.length)
  })
})

describe('runSort keyframes', () => {
  it('attaches keyframes to the trace it returns', () => {
    const trace = traceOf(60)
    expect(trace.keyframes.length).toBeGreaterThan(0)
    expect(trace.keyframes[0].index).toBe(0)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/core/keyframes.test.ts`
Expected: FAIL — cannot find module `./keyframes`.

- [ ] **Step 7: Implement keyframes**

Create `src/core/keyframes.ts`:

```ts
import { applyStep, createInitialState, type FrameState } from './frame'
import type { Keyframe, Trace } from './runner'
import type { Step } from './types'

export const KEYFRAME_INTERVAL = 2000

export function buildKeyframes(
  input: readonly number[],
  steps: readonly Step[],
  auxLength: number,
  interval: number = KEYFRAME_INTERVAL,
): Keyframe[] {
  const s = createInitialState(input, auxLength)
  const frames: Keyframe[] = [snapshot(s)]
  for (let i = 0; i < steps.length; i++) {
    applyStep(s, steps[i])
    if (s.index % interval === 0) frames.push(snapshot(s))
  }
  return frames
}

/**
 * State after `index` steps. Restores the nearest preceding keyframe and
 * replays forward, so both the work and the memory per seek are bounded.
 */
export function stateAt(trace: Trace, index: number): FrameState {
  const target = Math.max(0, Math.min(index, trace.steps.length))
  const kf = nearest(trace.keyframes, target)
  const s = restore(trace, kf)
  for (let i = kf.index; i < target; i++) applyStep(s, trace.steps[i])
  return s
}

function nearest(keyframes: readonly Keyframe[], index: number): Keyframe {
  let lo = 0
  let hi = keyframes.length - 1
  let best = keyframes[0]
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (keyframes[mid].index <= index) {
      best = keyframes[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

function restore(trace: Trace, kf: Keyframe): FrameState {
  const s = createInitialState(trace.input, trace.auxLength)
  s.main.set(kf.main)
  if (s.aux && kf.aux) s.aux.set(kf.aux)
  s.sorted.set(kf.sorted)
  s.counts = { ...kf.counts }
  s.index = kf.index
  // pivot/range and the decay arrays rebuild themselves during the replay below.
  return s
}

function snapshot(s: FrameState): Keyframe {
  return {
    index: s.index,
    main: Float64Array.from(s.main),
    aux: s.aux ? Float64Array.from(s.aux) : null,
    counts: { ...s.counts },
    sorted: Uint8Array.from(s.sorted),
  }
}
```

- [ ] **Step 8: Wire keyframes into the runner**

In `src/core/runner.ts`, add the import:

```ts
import { buildKeyframes } from './keyframes'
```

and replace `keyframes: [],` in the returned trace with:

```ts
      keyframes: buildKeyframes(input, arr.steps, arr.auxLength),
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/core/`
Expected: all passed.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/core
git commit -m "feat(core): add frame state, keyframes, and bounded seeking"
```

---

### Task 5: Input generation

**Files:**
- Create: `src/core/generate.ts`
- Test: `src/core/generate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Distribution = 'random' | 'nearly-sorted' | 'reversed' | 'few-unique' | 'sawtooth' | 'gaussian' | 'all-equal' | 'single-outlier'`
  - `const DISTRIBUTIONS: ReadonlyArray<{ id: Distribution; label: string }>`
  - `function makeRng(seed: number): () => number`
  - `function generate(n: number, dist: Distribution, seed: number): number[]`
  - `const MIN_N = 8`, `const MAX_N = 1000`, `const LARGE_N_WARNING = 400`

All values are integers in `1..n` so bar heights fill the canvas regardless of size.

- [ ] **Step 1: Write the failing tests**

Create `src/core/generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DISTRIBUTIONS, generate, makeRng, type Distribution } from './generate'

describe('makeRng', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const c = makeRng(43)
    const seqA = [a(), a(), a()]
    expect(seqA).toEqual([b(), b(), b()])
    expect(seqA).not.toEqual([c(), c(), c()])
  })

  it('stays inside [0, 1)', () => {
    const r = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generate', () => {
  const all = DISTRIBUTIONS.map((d) => d.id)

  it('covers every distribution in the exported list', () => {
    expect(all).toHaveLength(8)
  })

  it.each(all)('%s produces n integers within 1..n', (dist: Distribution) => {
    const out = generate(50, dist, 1)
    expect(out).toHaveLength(50)
    for (const v of out) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(50)
    }
  })

  it.each(all)('%s is reproducible from its seed', (dist: Distribution) => {
    expect(generate(40, dist, 99)).toEqual(generate(40, dist, 99))
  })

  it('reversed is strictly descending', () => {
    const out = generate(10, 'reversed', 1)
    expect(out).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('all-equal is constant', () => {
    expect(new Set(generate(30, 'all-equal', 1)).size).toBe(1)
  })

  it('few-unique has a small number of distinct values', () => {
    expect(new Set(generate(100, 'few-unique', 1)).size).toBeLessThanOrEqual(6)
  })

  it('nearly-sorted has far fewer inversions than random', () => {
    const inversions = (a: number[]) => {
      let c = 0
      for (let i = 0; i < a.length; i++)
        for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++
      return c
    }
    expect(inversions(generate(80, 'nearly-sorted', 3))).toBeLessThan(
      inversions(generate(80, 'random', 3)) / 4,
    )
  })

  it('single-outlier is sorted except for one displaced element', () => {
    const out = generate(20, 'single-outlier', 5)
    const sorted = [...out].sort((x, y) => x - y)
    expect(out).not.toEqual(sorted)
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('rejects sizes outside the supported range', () => {
    expect(() => generate(2, 'random', 1)).toThrow(RangeError)
    expect(() => generate(5000, 'random', 1)).toThrow(RangeError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/generate.test.ts`
Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Implement generation**

Create `src/core/generate.ts`:

```ts
export type Distribution =
  | 'random'
  | 'nearly-sorted'
  | 'reversed'
  | 'few-unique'
  | 'sawtooth'
  | 'gaussian'
  | 'all-equal'
  | 'single-outlier'

export const DISTRIBUTIONS: ReadonlyArray<{ id: Distribution; label: string }> = [
  { id: 'random', label: 'Random' },
  { id: 'nearly-sorted', label: 'Nearly sorted' },
  { id: 'reversed', label: 'Reversed' },
  { id: 'few-unique', label: 'Few unique' },
  { id: 'sawtooth', label: 'Sawtooth' },
  { id: 'gaussian', label: 'Gaussian' },
  { id: 'all-equal', label: 'All equal' },
  { id: 'single-outlier', label: 'Single outlier' },
]

export const MIN_N = 8
export const MAX_N = 1000
/** Above this, O(n^2) algorithms are likely to hit the step cap. */
export const LARGE_N_WARNING = 400

/** mulberry32 — small, fast, and good enough for shuffling bars. */
export function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generate(n: number, dist: Distribution, seed: number): number[] {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    throw new RangeError(`Array size must be an integer in ${MIN_N}..${MAX_N}, got ${n}`)
  }
  const rng = makeRng(seed)
  const ascending = Array.from({ length: n }, (_, i) => i + 1)

  switch (dist) {
    case 'random':
      return shuffle(ascending, rng)

    case 'reversed':
      return ascending.reverse()

    case 'nearly-sorted': {
      const out = ascending
      const swaps = Math.max(1, Math.round(n * 0.05))
      for (let k = 0; k < swaps; k++) {
        const i = Math.floor(rng() * (n - 1))
        const t = out[i]
        out[i] = out[i + 1]
        out[i + 1] = t
      }
      return out
    }

    case 'few-unique': {
      const buckets = 5
      const values = Array.from({ length: buckets }, (_, k) =>
        Math.max(1, Math.round(((k + 1) / buckets) * n)),
      )
      return Array.from({ length: n }, () => values[Math.floor(rng() * buckets)])
    }

    case 'sawtooth': {
      const teeth = Math.max(2, Math.round(n / 16))
      const period = Math.ceil(n / teeth)
      return Array.from({ length: n }, (_, i) =>
        clamp(Math.round(((i % period) / period) * n) + 1, n),
      )
    }

    case 'gaussian':
      return Array.from({ length: n }, () => {
        // Box-Muller, centred on n/2 with a sixth of the range as sigma.
        const u = Math.max(rng(), 1e-9)
        const v = rng()
        const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
        return clamp(Math.round(n / 2 + g * (n / 6)), n)
      })

    case 'all-equal':
      return new Array(n).fill(Math.ceil(n / 2))

    case 'single-outlier': {
      const out = ascending
      const from = Math.floor(rng() * (n - 1))
      const [v] = out.splice(from, 1)
      const to = from < n / 2 ? n - 1 : 0
      out.splice(to, 0, v)
      return out
    }
  }
}

function shuffle(a: number[], rng: () => number): number[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

const clamp = (v: number, n: number) => Math.max(1, Math.min(n, v))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/generate.test.ts`
Expected: all passed.

If `single-outlier` fails because the chosen element happens to land back in place, note that `from < n/2 ? n-1 : 0` always moves it across the midpoint, so this cannot happen for `n >= 8`.

- [ ] **Step 5: Commit**

```bash
git add src/core/generate.ts src/core/generate.test.ts
git commit -m "feat(core): add seeded input distributions"
```

---

### Task 6: Algorithm registry, conformance harness, and the exchange family

This task establishes the pattern every later algorithm task follows: add files to `impl/`, and the existing conformance harness automatically proves them.

**Files:**
- Create: `src/algorithms/families.ts`, `src/algorithms/source.ts`, `src/algorithms/index.ts`
- Create: `src/algorithms/impl/bubble.ts`, `cocktail.ts`, `oddEven.ts`, `gnome.ts`, `comb.ts`, `pancake.ts`
- Test: `src/algorithms/source.test.ts`, `src/algorithms/conformance.test.ts`

**Interfaces:**
- Consumes: `TrackedArray`, `AlgorithmMeta`, `SortFn`, `Family`, `runSort`, `applyStep`, `createInitialState`.
- Produces:
  - `interface Algorithm { meta: AlgorithmMeta; sort: SortFn; source: string }`
  - `const ALGORITHMS: readonly Algorithm[]` (sorted by family order then name)
  - `function getAlgorithm(id: string): Algorithm | undefined`
  - `function algorithmsByFamily(): ReadonlyArray<{ family: Family; label: string; items: readonly Algorithm[] }>`
  - `const FAMILY_LABELS: Record<Family, string>`, `const FAMILY_ORDER: readonly Family[]`
  - `function extractSortSource(raw: string): string`

- [ ] **Step 1: Write the failing test for source extraction**

Create `src/algorithms/source.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractSortSource } from './source'

const raw = `import type { TrackedArray } from '../../core/trackedArray'

export const meta = { id: 'x' }

export function sort(a: TrackedArray): void {
  a.swap(0, 1)
}
`

describe('extractSortSource', () => {
  it('returns only the sort function, without the export keyword', () => {
    expect(extractSortSource(raw)).toBe(
      'function sort(a: TrackedArray): void {\n  a.swap(0, 1)\n}',
    )
  })

  it('returns the whole input when there is no sort function', () => {
    expect(extractSortSource('const x = 1\n')).toBe('const x = 1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/algorithms/source.test.ts`
Expected: FAIL — cannot find module `./source`.

- [ ] **Step 3: Implement source extraction**

Create `src/algorithms/source.ts`:

```ts
/**
 * Pulls just the sort function out of an algorithm module's raw text, so the
 * code panel shows the algorithm rather than its imports and metadata.
 * Every impl file must declare `export function sort` last.
 */
export function extractSortSource(raw: string): string {
  const marker = raw.indexOf('export function sort')
  if (marker === -1) return raw.trim()
  return raw.slice(marker + 'export '.length).trim()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/algorithms/source.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Create the family metadata**

Create `src/algorithms/families.ts`:

```ts
import type { Family } from '../core/types'

export const FAMILY_ORDER: readonly Family[] = [
  'exchange',
  'insertion',
  'selection',
  'divide-and-conquer',
  'non-comparison',
  'network',
  'curiosity',
]

export const FAMILY_LABELS: Record<Family, string> = {
  exchange: 'Exchange',
  insertion: 'Insertion',
  selection: 'Selection',
  'divide-and-conquer': 'Divide & conquer',
  'non-comparison': 'Non-comparison',
  network: 'Networks & trees',
  curiosity: 'Curiosities',
}
```

- [ ] **Step 6: Create the registry**

Create `src/algorithms/index.ts`:

```ts
import type { AlgorithmMeta, Family, SortFn } from '../core/types'
import { FAMILY_LABELS, FAMILY_ORDER } from './families'
import { extractSortSource } from './source'

export interface Algorithm {
  meta: AlgorithmMeta
  sort: SortFn
  /** The sort function's own text, shown in the code panel. */
  source: string
}

type Module = { meta: AlgorithmMeta; sort: SortFn }

const modules = import.meta.glob<Module>('./impl/*.ts', { eager: true })
const sources = import.meta.glob<string>('./impl/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const all: Algorithm[] = Object.entries(modules).map(([path, mod]) => {
  if (!mod.meta || typeof mod.sort !== 'function') {
    throw new Error(`${path} must export both meta and sort`)
  }
  return { meta: mod.meta, sort: mod.sort, source: extractSortSource(sources[path] ?? '') }
})

all.sort((a, b) => {
  const fam = FAMILY_ORDER.indexOf(a.meta.family) - FAMILY_ORDER.indexOf(b.meta.family)
  return fam !== 0 ? fam : a.meta.name.localeCompare(b.meta.name)
})

export const ALGORITHMS: readonly Algorithm[] = all

const byId = new Map(all.map((a) => [a.meta.id, a]))

export function getAlgorithm(id: string): Algorithm | undefined {
  return byId.get(id)
}

export function algorithmsByFamily(): ReadonlyArray<{
  family: Family
  label: string
  items: readonly Algorithm[]
}> {
  return FAMILY_ORDER.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    items: all.filter((a) => a.meta.family === family),
  })).filter((g) => g.items.length > 0)
}

export { FAMILY_LABELS, FAMILY_ORDER }
```

- [ ] **Step 7: Write the conformance harness**

This one test file proves every algorithm added from here to the end of the plan. Create `src/algorithms/conformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALGORITHMS } from './index'
import { runSort } from '../core/runner'
import { applyStep, createInitialState } from '../core/frame'
import { generate, type Distribution } from '../core/generate'

const FIXTURES: ReadonlyArray<{ name: string; input: number[] }> = [
  { name: 'empty', input: [] },
  { name: 'single', input: [1] },
  { name: 'pair sorted', input: [1, 2] },
  { name: 'pair reversed', input: [2, 1] },
  { name: 'all equal', input: [4, 4, 4, 4, 4, 4, 4, 4] },
  { name: 'duplicate heavy', input: [3, 1, 3, 2, 1, 2, 3, 1, 2, 3] },
  { name: 'already sorted', input: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'reversed', input: [8, 7, 6, 5, 4, 3, 2, 1] },
]

const DISTS: Distribution[] = ['random', 'nearly-sorted', 'reversed', 'few-unique', 'gaussian']

describe('every registered algorithm', () => {
  it('has unique ids', () => {
    const ids = ALGORITHMS.map((a) => a.meta.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has non-empty metadata and source', () => {
    for (const a of ALGORITHMS) {
      expect(a.meta.name, a.meta.id).not.toBe('')
      expect(a.meta.description.length, a.meta.id).toBeGreaterThan(20)
      expect(a.source, a.meta.id).toContain('function sort')
      for (const key of ['best', 'average', 'worst', 'space'] as const) {
        expect(a.meta[key], `${a.meta.id}.${key}`).toMatch(/O\(/)
      }
    }
  })

  describe.each(ALGORITHMS.map((a) => [a.meta.id, a] as const))('%s', (_id, algo) => {
    const cap = (n: number) => algo.meta.maxN === undefined || n <= algo.meta.maxN

    it.each(FIXTURES.filter((f) => cap(f.input.length)).map((f) => [f.name, f.input] as const))(
      'sorts fixture: %s',
      (_name, input) => {
        const r = runSort(algo.sort, input)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.finalArray).toEqual([...input].sort((x, y) => x - y))
        expect(r.sorted).toBe(true)
      },
    )

    // Algorithms capped below 16 elements (bogo, stooge) are proved by the
    // fixtures alone — generating 64-element inputs for them is not meaningful.
    const tiny = (algo.meta.maxN ?? 64) < 16

    it.each(DISTS)('sorts a generated %s array', (dist) => {
      if (tiny) return
      const n = Math.min(64, algo.meta.maxN ?? 64)
      const input = generate(n, dist, 12345)
      const r = runSort(algo.sort, input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.finalArray).toEqual([...input].sort((x, y) => x - y))
    })

    it('produces a trace that replays to the same final array', () => {
      if (tiny) return
      const n = Math.min(40, algo.meta.maxN ?? 40)
      const input = generate(n, 'random', 777)
      const r = runSort(algo.sort, input)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const s = createInitialState(r.trace.input, r.trace.auxLength)
      for (const step of r.trace.steps) applyStep(s, step)
      expect(Array.from(s.main)).toEqual(r.finalArray)
      expect(s.counts).toEqual(r.trace.counts)
    })
  })
})
```

The harness has no total-count assertion: coverage is checked once, in Task 10, so
every task from here on leaves a fully green suite.

- [ ] **Step 8: Implement the exchange family**

Create `src/algorithms/impl/bubble.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bubble',
  name: 'Bubble sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Repeatedly walks the array swapping adjacent elements that are out of order. Each pass floats the largest remaining element to the end, so the sorted region grows from the right.',
}

export function sort(a: TrackedArray): void {
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false
    for (let i = 0; i < end; i++) {
      if (a.compare(i, i + 1) > 0) {
        a.swap(i, i + 1)
        swapped = true
      }
    }
    a.markSorted(end)
    if (!swapped) {
      for (let i = 0; i < end; i++) a.markSorted(i)
      return
    }
  }
  if (a.length > 0) a.markSorted(0)
}
```

Create `src/algorithms/impl/cocktail.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'cocktail',
  name: 'Cocktail shaker sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Bubble sort that alternates direction. Forward passes push the largest element right, backward passes push the smallest left, so the sorted region grows from both ends.',
}

export function sort(a: TrackedArray): void {
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    let swapped = false
    for (let i = lo; i < hi; i++) {
      if (a.compare(i, i + 1) > 0) {
        a.swap(i, i + 1)
        swapped = true
      }
    }
    a.markSorted(hi)
    hi--
    for (let i = hi; i > lo; i--) {
      if (a.compare(i - 1, i) > 0) {
        a.swap(i - 1, i)
        swapped = true
      }
    }
    a.markSorted(lo)
    lo++
    if (!swapped) break
  }
  for (let i = lo; i <= hi; i++) a.markSorted(i)
}
```

Create `src/algorithms/impl/oddEven.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'odd-even',
  name: 'Odd-even sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Alternates between comparing all odd-indexed pairs and all even-indexed pairs. Every pair in a phase is independent, which is what makes this one trivially parallelisable in hardware.',
}

export function sort(a: TrackedArray): void {
  let sorted = false
  while (!sorted) {
    sorted = true
    for (let phase = 1; phase >= 0; phase--) {
      for (let i = phase; i + 1 < a.length; i += 2) {
        if (a.compare(i, i + 1) > 0) {
          a.swap(i, i + 1)
          sorted = false
        }
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

Create `src/algorithms/impl/gnome.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'gnome',
  name: 'Gnome sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Walks forward while the order holds and steps backward swapping whenever it does not. A single cursor and one comparison per move — the simplest sort that still terminates for the right reason.',
}

export function sort(a: TrackedArray): void {
  let i = 0
  while (i < a.length) {
    if (i === 0 || a.compare(i - 1, i) <= 0) {
      i++
    } else {
      a.swap(i - 1, i)
      i--
    }
  }
  for (let k = 0; k < a.length; k++) a.markSorted(k)
}
```

Create `src/algorithms/impl/comb.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'comb',
  name: 'Comb sort',
  family: 'exchange',
  best: 'O(n log n)',
  average: 'O(n^2 / 2^p)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Bubble sort with a shrinking gap. Large gaps kill distant small values (turtles) early, and the gap divides by 1.3 each pass until it reaches 1 and the final pass is an ordinary bubble pass.',
}

export function sort(a: TrackedArray): void {
  let gap = a.length
  let swapped = true
  while (gap > 1 || swapped) {
    gap = Math.max(1, Math.floor(gap / 1.3))
    swapped = false
    for (let i = 0; i + gap < a.length; i++) {
      if (a.compare(i, i + gap) > 0) {
        a.swap(i, i + gap)
        swapped = true
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

Create `src/algorithms/impl/pancake.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'pancake',
  name: 'Pancake sort',
  family: 'exchange',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'The only permitted operation is flipping a prefix, like a spatula under a stack of pancakes. Each round flips the largest remaining element to the front, then flips it into its final place.',
}

export function sort(a: TrackedArray): void {
  const flip = (k: number) => {
    for (let i = 0, j = k; i < j; i++, j--) a.swap(i, j)
  }

  for (let n = a.length; n > 1; n--) {
    let max = 0
    for (let i = 1; i < n; i++) if (a.compare(i, max) > 0) max = i
    if (max !== n - 1) {
      if (max > 0) flip(max)
      flip(n - 1)
    }
    a.markSorted(n - 1)
  }
  if (a.length > 0) a.markSorted(0)
}
```

- [ ] **Step 9: Run the conformance harness**

Run: `npx vitest run src/algorithms/`
Expected: all tests pass — every per-algorithm test for the 6 exchange algorithms, and the whole suite green.

- [ ] **Step 10: Commit**

```bash
git add src/algorithms
git commit -m "feat(algorithms): add registry, conformance harness, and exchange family"
```

---

### Task 7: Insertion and selection families

**Files:**
- Create: `src/algorithms/impl/insertion.ts`, `binaryInsertion.ts`, `shell.ts`, `cycle.ts`, `selection.ts`, `doubleSelection.ts`, `heap.ts`
- Test: covered by `src/algorithms/conformance.test.ts` (no new test file)

**Interfaces:**
- Consumes: `AlgorithmMeta`, `TrackedArray`.
- Produces: seven more entries in `ALGORITHMS`. No new exported functions.

- [ ] **Step 1: Confirm the harness is watching**

Run: `npx vitest run src/algorithms/`
Expected: PASS, with per-algorithm blocks for exactly the 6 exchange algorithms.
Note the block count — it must grow by 7 once this task's files land, which is
how you know the registry picks up new files automatically.

- [ ] **Step 2: Implement insertion sort**

Create `src/algorithms/impl/insertion.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'insertion',
  name: 'Insertion sort',
  family: 'insertion',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Grows a sorted prefix one element at a time, sliding each new element left until it lands. Linear on nearly-sorted input, which is why real hybrid sorts fall back to it for small runs.',
}

export function sort(a: TrackedArray): void {
  for (let i = 1; i < a.length; i++) {
    a.markRange(0, i)
    let j = i
    while (j > 0 && a.compare(j - 1, j) > 0) {
      a.swap(j - 1, j)
      j--
    }
  }
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 3: Implement binary insertion sort**

Create `src/algorithms/impl/binaryInsertion.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'binary-insertion',
  name: 'Binary insertion sort',
  family: 'insertion',
  best: 'O(n log n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: true,
  inPlace: true,
  description:
    'Insertion sort that binary-searches for the landing position instead of scanning. Comparisons drop to O(n log n), but the elements still have to be shifted, so the moves stay quadratic.',
}

export function sort(a: TrackedArray): void {
  for (let i = 1; i < a.length; i++) {
    const key = a.get(i)
    let lo = 0
    let hi = i
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (a.compareValue(mid, key) <= 0) lo = mid + 1
      else hi = mid
    }
    for (let j = i; j > lo; j--) a.swap(j - 1, j)
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 4: Implement shell sort**

Create `src/algorithms/impl/shell.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'shell',
  name: 'Shell sort',
  family: 'insertion',
  best: 'O(n log n)',
  average: 'O(n^1.25)',
  worst: 'O(n^1.5)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Insertion sort applied to interleaved subsequences with a shrinking gap, using the Ciura sequence. Early wide passes move elements a long way cheaply, so the final gap-1 pass has almost nothing left to do.',
}

const GAPS = [1750, 701, 301, 132, 57, 23, 10, 4, 1]

export function sort(a: TrackedArray): void {
  for (const gap of GAPS) {
    if (gap >= a.length) continue
    for (let i = gap; i < a.length; i++) {
      let j = i
      while (j >= gap && a.compare(j - gap, j) > 0) {
        a.swap(j - gap, j)
        j -= gap
      }
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 5: Implement cycle sort**

Create `src/algorithms/impl/cycle.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'cycle',
  name: 'Cycle sort',
  family: 'insertion',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Counts how many elements are smaller than the held value to compute exactly where it belongs, then places it and picks up whatever was there. Writes are theoretically minimal — no element is ever written twice.',
}

export function sort(a: TrackedArray): void {
  /** Writes `item` at `pos` and returns whatever was displaced. */
  const place = (pos: number, item: number): number => {
    const held = a.get(pos)
    a.set(pos, item)
    return held
  }

  for (let start = 0; start + 1 < a.length; start++) {
    let item = a.get(start)

    let pos = start
    for (let i = start + 1; i < a.length; i++) if (a.compareValue(i, item) < 0) pos++
    if (pos === start) continue

    while (a.compareValue(pos, item) === 0) pos++
    item = place(pos, item)
    a.markSorted(pos)

    while (pos !== start) {
      pos = start
      for (let i = start + 1; i < a.length; i++) if (a.compareValue(i, item) < 0) pos++
      while (a.compareValue(pos, item) === 0) pos++
      item = place(pos, item)
      a.markSorted(pos)
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 6: Implement selection sort**

Create `src/algorithms/impl/selection.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'selection',
  name: 'Selection sort',
  family: 'selection',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Scans the unsorted region for the smallest element and swaps it into place. Always makes exactly n-1 swaps regardless of input, which makes it the cheapest quadratic sort when writes are expensive.',
}

export function sort(a: TrackedArray): void {
  for (let i = 0; i + 1 < a.length; i++) {
    a.markRange(i, a.length - 1)
    let min = i
    for (let j = i + 1; j < a.length; j++) if (a.compare(j, min) < 0) min = j
    if (min !== i) a.swap(i, min)
    a.markSorted(i)
  }
  a.clearMarks()
  if (a.length > 0) a.markSorted(a.length - 1)
}
```

- [ ] **Step 7: Implement double selection sort**

Create `src/algorithms/impl/doubleSelection.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'double-selection',
  name: 'Double selection sort',
  family: 'selection',
  best: 'O(n^2)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Selection sort that finds the minimum and the maximum in the same pass and places both, halving the number of passes. The subtlety is fixing up the maximum index when the first swap moves it.',
}

export function sort(a: TrackedArray): void {
  let lo = 0
  let hi = a.length - 1
  while (lo < hi) {
    let min = lo
    let max = lo
    for (let i = lo; i <= hi; i++) {
      if (a.compare(i, min) < 0) min = i
      if (a.compare(i, max) > 0) max = i
    }
    if (min !== lo) a.swap(lo, min)
    // The swap above may have moved the maximum out from under us.
    if (max === lo) max = min
    if (max !== hi) a.swap(hi, max)
    a.markSorted(lo, hi)
    lo++
    hi--
  }
  if (lo === hi) a.markSorted(lo)
}
```

- [ ] **Step 8: Implement heapsort**

Create `src/algorithms/impl/heap.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'heap',
  name: 'Heapsort',
  family: 'selection',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Selection sort with a better data structure. Builds a max-heap in the array itself, then repeatedly swaps the root to the end and sifts down. Guaranteed n log n with no extra memory.',
}

export function sort(a: TrackedArray): void {
  const siftDown = (root: number, end: number) => {
    while (2 * root + 1 < end) {
      let child = 2 * root + 1
      if (child + 1 < end && a.compare(child, child + 1) < 0) child++
      if (a.compare(root, child) >= 0) return
      a.swap(root, child)
      root = child
    }
  }

  for (let i = (a.length >> 1) - 1; i >= 0; i--) siftDown(i, a.length)
  for (let end = a.length - 1; end > 0; end--) {
    a.swap(0, end)
    a.markSorted(end)
    siftDown(0, end)
  }
  if (a.length > 0) a.markSorted(0)
}
```

- [ ] **Step 9: Run the conformance harness**

Run: `npx vitest run src/algorithms/`
Expected: all tests pass, with per-algorithm blocks for 13 algorithms.

- [ ] **Step 10: Commit**

```bash
git add src/algorithms/impl
git commit -m "feat(algorithms): add insertion and selection families"
```

---

### Task 8: Divide and conquer family

**Files:**
- Create: `src/algorithms/impl/mergeTopDown.ts`, `mergeBottomUp.ts`, `quickLomuto.ts`, `quickHoare.ts`, `quickThreeWay.ts`, `quickMedian3.ts`, `introsort.ts`, `timsort.ts`
- Test: covered by `src/algorithms/conformance.test.ts`

**Interfaces:**
- Consumes: `AlgorithmMeta`, `TrackedArray`, `AuxArray` (via `a.alloc`).
- Produces: eight more entries in `ALGORITHMS`.

Note: the merge helper is written out in full in both merge files rather than shared. Each impl file is displayed to the user as a standalone teaching artifact, so it must read on its own.

- [ ] **Step 1: Implement top-down merge sort**

Create `src/algorithms/impl/mergeTopDown.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'merge-top-down',
  name: 'Merge sort (top-down)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Splits the range in half, sorts each half recursively, then merges them through an auxiliary buffer. The n log n bound holds on every input — no adversarial case exists.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const aux = a.alloc(a.length)

  const merge = (lo: number, mid: number, hi: number) => {
    for (let i = lo; i <= hi; i++) aux.set(i, a.get(i))
    let i = lo
    let j = mid + 1
    for (let k = lo; k <= hi; k++) {
      if (i > mid) a.set(k, aux.get(j++))
      else if (j > hi) a.set(k, aux.get(i++))
      else if (aux.compare(j, i) < 0) a.set(k, aux.get(j++))
      else a.set(k, aux.get(i++))
    }
  }

  const split = (lo: number, hi: number) => {
    if (lo >= hi) return
    const mid = lo + ((hi - lo) >> 1)
    split(lo, mid)
    split(mid + 1, hi)
    a.markRange(lo, hi)
    merge(lo, mid, hi)
  }

  split(0, a.length - 1)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 2: Implement bottom-up merge sort**

Create `src/algorithms/impl/mergeBottomUp.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'merge-bottom-up',
  name: 'Merge sort (bottom-up)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'The same merges as top-down, driven by a doubling width instead of recursion. No call stack, and the passes are visible as an obvious rhythm: pairs, then fours, then eights.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const aux = a.alloc(a.length)

  const merge = (lo: number, mid: number, hi: number) => {
    for (let i = lo; i <= hi; i++) aux.set(i, a.get(i))
    let i = lo
    let j = mid + 1
    for (let k = lo; k <= hi; k++) {
      if (i > mid) a.set(k, aux.get(j++))
      else if (j > hi) a.set(k, aux.get(i++))
      else if (aux.compare(j, i) < 0) a.set(k, aux.get(j++))
      else a.set(k, aux.get(i++))
    }
  }

  for (let width = 1; width < a.length; width *= 2) {
    for (let lo = 0; lo + width < a.length; lo += 2 * width) {
      const mid = lo + width - 1
      const hi = Math.min(lo + 2 * width - 1, a.length - 1)
      a.markRange(lo, hi)
      merge(lo, mid, hi)
    }
  }
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 3: Implement Lomuto quicksort**

Create `src/algorithms/impl/quickLomuto.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-lomuto',
  name: 'Quicksort (Lomuto)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    'Takes the last element as the pivot and sweeps one cursor forward, swapping every smaller element into a growing left region. Simple to state, but degrades to quadratic on already-sorted input.',
}

export function sort(a: TrackedArray): void {
  const partition = (lo: number, hi: number): number => {
    a.markPivot(hi)
    let i = lo
    for (let j = lo; j < hi; j++) {
      if (a.compare(j, hi) < 0) {
        if (i !== j) a.swap(i, j)
        i++
      }
    }
    a.swap(i, hi)
    a.clearMarks()
    return i
  }

  const qs = (lo: number, hi: number) => {
    if (lo >= hi) {
      if (lo === hi) a.markSorted(lo)
      return
    }
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    a.markSorted(p)
    qs(lo, p - 1)
    qs(p + 1, hi)
  }

  qs(0, a.length - 1)
}
```

- [ ] **Step 4: Implement Hoare quicksort**

Create `src/algorithms/impl/quickHoare.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-hoare',
  name: 'Quicksort (Hoare)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    "Hoare's original scheme: two cursors walk inward and swap the pairs they find out of place. It performs roughly three times fewer swaps than Lomuto and handles duplicate-heavy input far better.",
}

export function sort(a: TrackedArray): void {
  const partition = (lo: number, hi: number): number => {
    const pivotIndex = lo + ((hi - lo) >> 1)
    a.markPivot(pivotIndex)
    const pivot = a.get(pivotIndex)
    let i = lo - 1
    let j = hi + 1
    for (;;) {
      do i++
      while (a.compareValue(i, pivot) < 0)
      do j--
      while (a.compareValue(j, pivot) > 0)
      if (i >= j) {
        a.clearMarks()
        return j
      }
      a.swap(i, j)
    }
  }

  const qs = (lo: number, hi: number) => {
    if (lo >= hi) return
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    qs(lo, p)
    qs(p + 1, hi)
  }

  qs(0, a.length - 1)
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 5: Implement three-way quicksort**

Create `src/algorithms/impl/quickThreeWay.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-three-way',
  name: 'Quicksort (3-way)',
  family: 'divide-and-conquer',
  best: 'O(n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    "Dijkstra's Dutch national flag partition splits into less-than, equal-to and greater-than regions. Elements equal to the pivot are finished immediately, so arrays with few distinct values sort in linear time.",
}

export function sort(a: TrackedArray): void {
  const qs = (lo: number, hi: number) => {
    if (lo >= hi) {
      if (lo === hi) a.markSorted(lo)
      return
    }
    a.markRange(lo, hi)
    const pivotIndex = lo + ((hi - lo) >> 1)
    a.markPivot(pivotIndex)
    const pivot = a.get(pivotIndex)

    let lt = lo
    let i = lo
    let gt = hi
    while (i <= gt) {
      const c = a.compareValue(i, pivot)
      if (c < 0) a.swap(lt++, i++)
      else if (c > 0) a.swap(i, gt--)
      else i++
    }
    a.clearMarks()
    for (let k = lt; k <= gt; k++) a.markSorted(k)

    qs(lo, lt - 1)
    qs(gt + 1, hi)
  }

  qs(0, a.length - 1)
}
```

- [ ] **Step 6: Implement median-of-three quicksort**

Create `src/algorithms/impl/quickMedian3.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'quick-median3',
  name: 'Quicksort (median of three)',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    'Lomuto partitioning with the median of the first, middle and last elements parked as the pivot. Three comparisons of setup remove the quadratic behaviour on sorted and reversed input.',
}

export function sort(a: TrackedArray): void {
  const medianToEnd = (lo: number, hi: number) => {
    const mid = lo + ((hi - lo) >> 1)
    if (a.compare(mid, lo) < 0) a.swap(mid, lo)
    if (a.compare(hi, lo) < 0) a.swap(hi, lo)
    if (a.compare(hi, mid) < 0) a.swap(hi, mid)
    a.swap(mid, hi) // the median now sits at hi, ready to act as the pivot
  }

  const partition = (lo: number, hi: number): number => {
    medianToEnd(lo, hi)
    a.markPivot(hi)
    let i = lo
    for (let j = lo; j < hi; j++) {
      if (a.compare(j, hi) < 0) {
        if (i !== j) a.swap(i, j)
        i++
      }
    }
    a.swap(i, hi)
    a.clearMarks()
    return i
  }

  const qs = (lo: number, hi: number) => {
    if (lo >= hi) {
      if (lo === hi) a.markSorted(lo)
      return
    }
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    a.markSorted(p)
    qs(lo, p - 1)
    qs(p + 1, hi)
  }

  qs(0, a.length - 1)
}
```

- [ ] **Step 7: Implement introsort**

Create `src/algorithms/impl/introsort.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'introsort',
  name: 'Introsort',
  family: 'divide-and-conquer',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description:
    "Quicksort until the recursion gets too deep, then heapsort for that subrange, then insertion sort for small ranges. This hybrid is what most C++ standard libraries actually ship as std::sort.",
}

const SMALL = 16

export function sort(a: TrackedArray): void {
  const insertion = (lo: number, hi: number) => {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i
      while (j > lo && a.compare(j - 1, j) > 0) {
        a.swap(j - 1, j)
        j--
      }
    }
  }

  const siftDown = (lo: number, root: number, count: number) => {
    while (2 * root + 1 < count) {
      let child = 2 * root + 1
      if (child + 1 < count && a.compare(lo + child, lo + child + 1) < 0) child++
      if (a.compare(lo + root, lo + child) >= 0) return
      a.swap(lo + root, lo + child)
      root = child
    }
  }

  const heap = (lo: number, hi: number) => {
    const count = hi - lo + 1
    for (let i = (count >> 1) - 1; i >= 0; i--) siftDown(lo, i, count)
    for (let end = count - 1; end > 0; end--) {
      a.swap(lo, lo + end)
      siftDown(lo, 0, end)
    }
  }

  const partition = (lo: number, hi: number): number => {
    const mid = lo + ((hi - lo) >> 1)
    if (a.compare(mid, lo) < 0) a.swap(mid, lo)
    if (a.compare(hi, lo) < 0) a.swap(hi, lo)
    if (a.compare(hi, mid) < 0) a.swap(hi, mid)
    a.swap(mid, hi)
    a.markPivot(hi)
    let i = lo
    for (let j = lo; j < hi; j++) {
      if (a.compare(j, hi) < 0) {
        if (i !== j) a.swap(i, j)
        i++
      }
    }
    a.swap(i, hi)
    a.clearMarks()
    return i
  }

  const intro = (lo: number, hi: number, depth: number) => {
    if (lo >= hi) return
    if (hi - lo + 1 <= SMALL) {
      insertion(lo, hi)
      return
    }
    if (depth === 0) {
      heap(lo, hi)
      return
    }
    a.markRange(lo, hi)
    const p = partition(lo, hi)
    intro(lo, p - 1, depth - 1)
    intro(p + 1, hi, depth - 1)
  }

  const maxDepth = a.length > 1 ? 2 * Math.floor(Math.log2(a.length)) : 1
  intro(0, a.length - 1, maxDepth)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 8: Implement simplified Timsort**

Create `src/algorithms/impl/timsort.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'timsort',
  name: 'Timsort (simplified)',
  family: 'divide-and-conquer',
  best: 'O(n)',
  average: 'O(n log n)',
  worst: 'O(n log n)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Insertion-sorts fixed runs of 32, then merges runs of doubling width. This is the shape of the real Timsort in Python and Java, minus its galloping mode and run-length invariants.',
}

const RUN = 32

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const aux = a.alloc(a.length)

  const insertion = (lo: number, hi: number) => {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i
      while (j > lo && a.compare(j - 1, j) > 0) {
        a.swap(j - 1, j)
        j--
      }
    }
  }

  const merge = (lo: number, mid: number, hi: number) => {
    for (let i = lo; i <= hi; i++) aux.set(i, a.get(i))
    let i = lo
    let j = mid + 1
    for (let k = lo; k <= hi; k++) {
      if (i > mid) a.set(k, aux.get(j++))
      else if (j > hi) a.set(k, aux.get(i++))
      else if (aux.compare(j, i) < 0) a.set(k, aux.get(j++))
      else a.set(k, aux.get(i++))
    }
  }

  for (let lo = 0; lo < a.length; lo += RUN) {
    const hi = Math.min(lo + RUN - 1, a.length - 1)
    a.markRange(lo, hi)
    insertion(lo, hi)
  }

  for (let width = RUN; width < a.length; width *= 2) {
    for (let lo = 0; lo + width < a.length; lo += 2 * width) {
      const mid = lo + width - 1
      const hi = Math.min(lo + 2 * width - 1, a.length - 1)
      a.markRange(lo, hi)
      merge(lo, mid, hi)
    }
  }

  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 9: Run the conformance harness**

Run: `npx vitest run src/algorithms/`
Expected: all per-algorithm tests pass for 21 algorithms.

If the `pair sorted` / `single` fixtures fail on a merge variant, check the `if (a.length < 2) return` guard — `alloc(0)` is legal but merging an empty range is not.

- [ ] **Step 10: Commit**

```bash
git add src/algorithms/impl
git commit -m "feat(algorithms): add divide and conquer family"
```

---

### Task 9: Non-comparison family

These sorts read values rather than only comparing them, so they only work on non-negative integers — which is exactly what `generate` produces. Each metadata `description` states that constraint.

**Files:**
- Create: `src/algorithms/impl/counting.ts`, `radixLsd.ts`, `radixMsd.ts`, `bucket.ts`, `pigeonhole.ts`
- Test: covered by `src/algorithms/conformance.test.ts`

**Interfaces:**
- Consumes: `AlgorithmMeta`, `TrackedArray`, `a.alloc`.
- Produces: five more entries in `ALGORITHMS`.

- [ ] **Step 1: Implement counting sort**

Create `src/algorithms/impl/counting.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'counting',
  name: 'Counting sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n + k)',
  space: 'O(k)',
  stable: true,
  inPlace: false,
  description:
    'Counts how many times each value occurs, then writes the values back in order. It never compares two elements at all, so the n log n lower bound simply does not apply. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))

  const tally = a.alloc(max + 1)
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    tally.set(v, tally.get(v) + 1)
  }

  let k = 0
  for (let v = 0; v <= max; v++) {
    let remaining = tally.get(v)
    while (remaining-- > 0) {
      a.set(k, v)
      a.markSorted(k)
      k++
    }
  }
}
```

- [ ] **Step 2: Implement LSD radix sort**

Create `src/algorithms/impl/radixLsd.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'radix-lsd',
  name: 'Radix sort (LSD, base 10)',
  family: 'non-comparison',
  best: 'O(d * n)',
  average: 'O(d * n)',
  worst: 'O(d * n)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Stably distributes elements by their least significant digit, then the next, and so on. Because each pass is stable, after the final digit the whole array is ordered. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return
  const out = a.alloc(a.length)

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))

  for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
    // The digit histogram is bookkeeping, not array data, so it stays untracked.
    const count = new Array<number>(10).fill(0)
    for (let i = 0; i < a.length; i++) count[Math.floor(a.get(i) / exp) % 10]++
    for (let d = 1; d < 10; d++) count[d] += count[d - 1]
    for (let i = a.length - 1; i >= 0; i--) {
      const v = a.get(i)
      const d = Math.floor(v / exp) % 10
      out.set(--count[d], v)
    }
    for (let i = 0; i < a.length; i++) a.set(i, out.get(i))
  }

  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 3: Implement MSD radix sort**

Create `src/algorithms/impl/radixMsd.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'radix-msd',
  name: 'Radix sort (MSD, base 10)',
  family: 'non-comparison',
  best: 'O(d * n)',
  average: 'O(d * n)',
  worst: 'O(d * n)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Buckets by the most significant digit first, then recurses into each bucket on the next digit down. Unlike LSD it can finish early once a bucket holds one element. Requires non-negative integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, a.get(i))
  let start = 1
  while (start * 10 <= max) start *= 10

  const msd = (lo: number, hi: number, exp: number) => {
    if (hi <= lo || exp < 1) return
    a.markRange(lo, hi)

    const buckets: number[][] = Array.from({ length: 10 }, () => [])
    for (let i = lo; i <= hi; i++) {
      const v = a.get(i)
      buckets[Math.floor(v / exp) % 10].push(v)
    }

    let k = lo
    const bounds: Array<[number, number]> = []
    for (const bucket of buckets) {
      const from = k
      for (const v of bucket) a.set(k++, v)
      bounds.push([from, k - 1])
    }

    for (const [from, to] of bounds) {
      if (to > from) msd(from, to, Math.floor(exp / 10))
    }
  }

  msd(0, a.length - 1, start)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 4: Implement bucket sort**

Create `src/algorithms/impl/bucket.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bucket',
  name: 'Bucket sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n^2)',
  space: 'O(n + k)',
  stable: true,
  inPlace: false,
  description:
    'Scatters values into buckets spanning equal slices of the value range, sorts each bucket with insertion sort, and concatenates. Linear when the input is spread evenly, quadratic when everything lands in one bucket.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === max) {
    for (let i = 0; i < a.length; i++) a.markSorted(i)
    return
  }

  const count = Math.max(2, Math.floor(Math.sqrt(a.length)))
  const buckets: number[][] = Array.from({ length: count }, () => [])
  const span = (max - min + 1) / count

  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    const b = Math.min(count - 1, Math.floor((v - min) / span))
    buckets[b].push(v)
  }

  let k = 0
  for (const bucket of buckets) {
    // Insertion sort within the bucket, on plain values.
    for (let i = 1; i < bucket.length; i++) {
      const key = bucket[i]
      let j = i - 1
      while (j >= 0 && bucket[j] > key) {
        bucket[j + 1] = bucket[j]
        j--
      }
      bucket[j + 1] = key
    }
    if (bucket.length > 0) a.markRange(k, k + bucket.length - 1)
    for (const v of bucket) {
      a.set(k, v)
      a.markSorted(k)
      k++
    }
  }
  a.clearMarks()
}
```

- [ ] **Step 5: Implement pigeonhole sort**

Create `src/algorithms/impl/pigeonhole.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'pigeonhole',
  name: 'Pigeonhole sort',
  family: 'non-comparison',
  best: 'O(n + k)',
  average: 'O(n + k)',
  worst: 'O(n + k)',
  space: 'O(k)',
  stable: true,
  inPlace: false,
  description:
    'Counting sort shifted by the minimum value, so the holes span only the range actually present. Fast when the value range is close to the element count, hopeless when it is not. Requires integer values.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    if (v < min) min = v
    if (v > max) max = v
  }

  const holes = a.alloc(max - min + 1)
  for (let i = 0; i < a.length; i++) {
    const v = a.get(i)
    holes.set(v - min, holes.get(v - min) + 1)
  }

  let k = 0
  for (let h = 0; h < holes.length; h++) {
    let remaining = holes.get(h)
    while (remaining-- > 0) {
      a.set(k, h + min)
      a.markSorted(k)
      k++
    }
  }
}
```

- [ ] **Step 6: Run the conformance harness**

Run: `npx vitest run src/algorithms/`
Expected: all per-algorithm tests pass for 26 algorithms.

- [ ] **Step 7: Commit**

```bash
git add src/algorithms/impl
git commit -m "feat(algorithms): add non-comparison family"
```

---

### Task 10: Networks, trees, and curiosities

This task takes the registry past 28, so the conformance count assertion turns green.

**Files:**
- Create: `src/algorithms/impl/bitonic.ts`, `tree.ts`, `strand.ts`, `bogo.ts`, `stooge.ts`
- Test: `src/algorithms/coverage.test.ts` (new), plus the existing `src/algorithms/conformance.test.ts`

**Interfaces:**
- Consumes: `AlgorithmMeta`, `TrackedArray`.
- Produces: five more entries in `ALGORITHMS`, bringing the total to 31.

- [ ] **Step 1: Implement bitonic sort**

Create `src/algorithms/impl/bitonic.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bitonic',
  name: 'Bitonic sort',
  family: 'network',
  best: 'O(n log^2 n)',
  average: 'O(n log^2 n)',
  worst: 'O(n log^2 n)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'A sorting network: the sequence of comparisons is fixed in advance and does not depend on the data. Worse than n log n on one processor, but every comparison in a stage is independent, so hardware runs a whole stage at once.',
}

export function sort(a: TrackedArray): void {
  /** Largest power of two strictly less than n — this is what lets n be arbitrary. */
  const halfPowerOfTwo = (n: number): number => {
    let k = 1
    while (k < n) k <<= 1
    return k >> 1
  }

  const bitonicMerge = (lo: number, n: number, ascending: boolean) => {
    if (n <= 1) return
    const m = halfPowerOfTwo(n)
    for (let i = lo; i < lo + n - m; i++) {
      if (a.compare(i, i + m) > 0 === ascending) a.swap(i, i + m)
    }
    bitonicMerge(lo, m, ascending)
    bitonicMerge(lo + m, n - m, ascending)
  }

  const bitonicSort = (lo: number, n: number, ascending: boolean) => {
    if (n <= 1) return
    const m = n >> 1
    bitonicSort(lo, m, !ascending)
    bitonicSort(lo + m, n - m, ascending)
    a.markRange(lo, lo + n - 1)
    bitonicMerge(lo, n, ascending)
  }

  bitonicSort(0, a.length, true)
  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 2: Implement tree sort**

Create `src/algorithms/impl/tree.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'tree',
  name: 'Tree sort',
  family: 'network',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Inserts every element into an unbalanced binary search tree, then writes the in-order traversal back. Sorted input degenerates the tree into a linked list, which is where the quadratic worst case comes from.',
}

interface Node {
  value: number
  left: Node | null
  right: Node | null
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let root: Node | null = null

  const insert = (value: number) => {
    const node: Node = { value, left: null, right: null }
    if (!root) {
      root = node
      return
    }
    let cur = root
    for (;;) {
      if (value < cur.value) {
        if (!cur.left) {
          cur.left = node
          return
        }
        cur = cur.left
      } else {
        if (!cur.right) {
          cur.right = node
          return
        }
        cur = cur.right
      }
    }
  }

  for (let i = 0; i < a.length; i++) insert(a.get(i))

  let k = 0
  const stack: Node[] = []
  let cur: Node | null = root
  while (cur || stack.length > 0) {
    while (cur) {
      stack.push(cur)
      cur = cur.left
    }
    const node = stack.pop() as Node
    a.set(k, node.value)
    a.markSorted(k)
    k++
    cur = node.right
  }
}
```

- [ ] **Step 3: Implement strand sort**

Create `src/algorithms/impl/strand.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'strand',
  name: 'Strand sort',
  family: 'network',
  best: 'O(n)',
  average: 'O(n^2)',
  worst: 'O(n^2)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Repeatedly pulls out an increasing subsequence — a strand — and merges it into the result. Input that is already mostly ordered yields one long strand and finishes in linear time.',
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  const remaining: number[] = []
  for (let i = 0; i < a.length; i++) remaining.push(a.get(i))

  let result: number[] = []

  while (remaining.length > 0) {
    const strand: number[] = [remaining.shift() as number]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i] >= strand[strand.length - 1]) {
        strand.push(remaining[i])
        remaining.splice(i, 1)
      } else {
        i++
      }
    }

    const merged: number[] = []
    let x = 0
    let y = 0
    while (x < result.length && y < strand.length) {
      merged.push(result[x] <= strand[y] ? result[x++] : strand[y++])
    }
    while (x < result.length) merged.push(result[x++])
    while (y < strand.length) merged.push(strand[y++])
    result = merged

    // Show the merged prefix landing back in the array after each strand.
    for (let i = 0; i < result.length; i++) a.set(i, result[i])
    a.markRange(0, result.length - 1)
  }

  a.clearMarks()
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 4: Implement bogosort**

Create `src/algorithms/impl/bogo.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'bogo',
  name: 'Bogosort',
  family: 'curiosity',
  best: 'O(n)',
  average: 'O(n * n!)',
  worst: 'O(infinity)',
  space: 'O(1)',
  stable: false,
  inPlace: true,
  description:
    'Shuffles the array and checks whether it happens to be sorted, forever. Included as the reference point for what a bad algorithm actually looks like. Capped at 8 elements, and it will still take a while.',
  maxN: 8,
}

export function sort(a: TrackedArray): void {
  // A fixed seed keeps runs reproducible, so the same array always animates the same way.
  let seed = 0x2f6e2b1
  const rnd = () => {
    seed = (Math.imul(seed, 48271) % 0x7fffffff) >>> 0
    return seed / 0x7fffffff
  }

  const isSorted = () => {
    for (let i = 1; i < a.length; i++) if (a.compare(i - 1, i) > 0) return false
    return true
  }

  while (!isSorted()) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      if (i !== j) a.swap(i, j)
    }
  }
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 5: Implement stooge sort**

Create `src/algorithms/impl/stooge.ts`:

```ts
import type { AlgorithmMeta } from '../../core/types'
import type { TrackedArray } from '../../core/trackedArray'

export const meta: AlgorithmMeta = {
  id: 'stooge',
  name: 'Stooge sort',
  family: 'curiosity',
  best: 'O(n^2.71)',
  average: 'O(n^2.71)',
  worst: 'O(n^2.71)',
  space: 'O(n)',
  stable: false,
  inPlace: true,
  description:
    'Sorts the first two thirds, then the last two thirds, then the first two thirds again. Provably correct, spectacularly inefficient, and a genuinely useful exercise in why the recursion works. Capped at 64 elements.',
  maxN: 64,
}

export function sort(a: TrackedArray): void {
  const stooge = (lo: number, hi: number) => {
    if (lo >= hi) return
    if (a.compare(lo, hi) > 0) a.swap(lo, hi)
    if (hi - lo + 1 > 2) {
      const third = Math.floor((hi - lo + 1) / 3)
      stooge(lo, hi - third)
      stooge(lo + third, hi)
      stooge(lo, hi - third)
    }
  }

  stooge(0, a.length - 1)
  for (let i = 0; i < a.length; i++) a.markSorted(i)
}
```

- [ ] **Step 6: Add the coverage test**

The registry is complete now, so this is the moment the total is worth asserting.
Create `src/algorithms/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALGORITHMS, algorithmsByFamily } from './index'
import { FAMILY_ORDER } from './families'

describe('algorithm coverage', () => {
  it('registers at least 28 algorithms', () => {
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(28)
  })

  it('populates every family', () => {
    expect(algorithmsByFamily().map((g) => g.family)).toEqual(FAMILY_ORDER)
  })

  it('includes the algorithms the spec names explicitly', () => {
    const ids = new Set(ALGORITHMS.map((a) => a.meta.id))
    for (const id of [
      'bubble', 'cocktail', 'odd-even', 'gnome', 'comb', 'pancake',
      'insertion', 'binary-insertion', 'shell', 'cycle',
      'selection', 'double-selection', 'heap',
      'merge-top-down', 'merge-bottom-up', 'quick-lomuto', 'quick-hoare',
      'quick-three-way', 'quick-median3', 'introsort', 'timsort',
      'counting', 'radix-lsd', 'radix-msd', 'bucket', 'pigeonhole',
      'bitonic', 'tree', 'strand', 'bogo', 'stooge',
    ]) {
      expect(ids, `missing algorithm: ${id}`).toContain(id)
    }
  })

  it('caps the algorithms that would otherwise never finish', () => {
    for (const id of ['bogo', 'stooge']) {
      const algo = ALGORITHMS.find((a) => a.meta.id === id)!
      expect(algo.meta.maxN, id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 7: Run the full conformance harness**

Run: `npx vitest run src/algorithms/`
Expected: **all tests pass, including the new coverage test** (31 registered).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/algorithms
git commit -m "feat(algorithms): add networks, trees, and curiosities — 31 total"
```

---

### Task 11: Worker execution path

**Files:**
- Create: `src/worker/protocol.ts`, `src/worker/compile.ts`, `src/worker/execute.ts`, `src/worker/sortRunner.worker.ts`, `src/worker/useRunner.ts`
- Test: `src/worker/compile.test.ts`, `src/worker/execute.test.ts`, `src/worker/useRunner.test.tsx`

**Interfaces:**
- Consumes: `runSort`, `RunResult`, `RunError`, `Limits`, `getAlgorithm`, `SortFn`.
- Produces:
  - `type RunRequest = { id: number; input: number[]; limits?: Limits } & ({ kind: 'builtin'; algorithmId: string } | { kind: 'custom'; source: string })`
  - `interface RunResponse { id: number; result: RunResult }`
  - `function compileCustom(source: string): { ok: true; fn: SortFn } | { ok: false; error: RunError }`
  - `function execute(req: RunRequest): RunResult`
  - `function useRunner(createWorker?: () => WorkerLike): { run(req: Omit<RunRequest, 'id'>): Promise<RunResult>; busy: boolean }`
  - `interface WorkerLike { postMessage(m: unknown): void; terminate(): void; addEventListener(t: 'message', l: (e: { data: RunResponse }) => void): void; removeEventListener(t: 'message', l: (e: { data: RunResponse }) => void): void }`

- [ ] **Step 1: Write the failing tests for compilation**

Create `src/worker/compile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compileCustom } from './compile'
import { runSort } from '../core/runner'

describe('compileCustom', () => {
  it('compiles a function named sort and it actually sorts', () => {
    const c = compileCustom(`
function sort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i
    while (j > 0 && arr.compare(j - 1, j) > 0) { arr.swap(j - 1, j); j-- }
  }
}`)
    expect(c.ok).toBe(true)
    if (!c.ok) return
    const r = runSort(c.fn, [3, 1, 2])
    expect(r.ok && r.finalArray).toEqual([1, 2, 3])
  })

  it('accepts a const arrow function assigned to sort', () => {
    const c = compileCustom('const sort = (arr) => { arr.swap(0, 1) }')
    expect(c.ok).toBe(true)
  })

  it('reports a syntax error', () => {
    const c = compileCustom('function sort(arr) { if ( }')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('syntax')
    expect(c.error.message.length).toBeGreaterThan(0)
  })

  it('reports not-a-function when sort is missing', () => {
    const c = compileCustom('const helper = 1')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('not-a-function')
    expect(c.error.message).toContain('sort')
  })

  it('reports a runtime error thrown at module level', () => {
    const c = compileCustom('throw new Error("top level boom")\nfunction sort() {}')
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.code).toBe('runtime')
    expect(c.error.message).toContain('top level boom')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/worker/compile.test.ts`
Expected: FAIL — cannot find module `./compile`.

- [ ] **Step 3: Implement compilation**

Create `src/worker/compile.ts`:

```ts
import type { RunError } from '../core/runner'
import type { SortFn } from '../core/types'

/**
 * Turns user source into a callable sort function.
 * The prologue is kept on line 1 so reported line numbers match what the user typed.
 */
export function compileCustom(
  source: string,
): { ok: true; fn: SortFn } | { ok: false; error: RunError } {
  let factory: () => unknown
  try {
    factory = new Function(
      `"use strict";${source}\n;return typeof sort === 'function' ? sort : undefined;`,
    ) as () => unknown
  } catch (e) {
    const err = e as Error
    return { ok: false, error: { code: 'syntax', message: err.message } }
  }

  let candidate: unknown
  try {
    candidate = factory()
  } catch (e) {
    const err = e as Error
    return { ok: false, error: { code: 'runtime', message: err.message } }
  }

  if (typeof candidate !== 'function') {
    return {
      ok: false,
      error: {
        code: 'not-a-function',
        message: 'Your code must define a function called sort(arr)',
      },
    }
  }

  return { ok: true, fn: candidate as SortFn }
}
```

- [ ] **Step 4: Write the failing tests for execute**

Create `src/worker/execute.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { execute } from './execute'

describe('execute', () => {
  it('runs a built-in algorithm by id', () => {
    const r = execute({ id: 1, kind: 'builtin', algorithmId: 'heap', input: [3, 1, 2] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([1, 2, 3])
    expect(r.sorted).toBe(true)
  })

  it('reports an unknown algorithm id', () => {
    const r = execute({ id: 1, kind: 'builtin', algorithmId: 'nope', input: [1] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toContain('nope')
  })

  it('runs custom source', () => {
    const r = execute({
      id: 2,
      kind: 'custom',
      source: 'function sort(arr) { for (let i = 0; i < arr.length; i++) for (let j = 0; j + 1 < arr.length; j++) if (arr.compare(j, j+1) > 0) arr.swap(j, j+1) }',
      input: [5, 4, 3],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalArray).toEqual([3, 4, 5])
  })

  it('surfaces a compile failure as a run failure', () => {
    const r = execute({ id: 3, kind: 'custom', source: 'function sort( {', input: [1] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('syntax')
  })

  it('honours a caller-supplied step budget', () => {
    const r = execute({
      id: 4,
      kind: 'custom',
      source: 'function sort(arr) { for (;;) arr.get(0) }',
      input: [1, 2],
      limits: { maxSteps: 100, maxMillis: 10_000 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('step-budget')
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/worker/execute.test.ts`
Expected: FAIL — cannot find module `./execute`.

- [ ] **Step 6: Implement the protocol and execute**

Create `src/worker/protocol.ts`:

```ts
import type { Limits } from '../core/limits'
import type { RunResult } from '../core/runner'

export type RunRequest = { id: number; input: number[]; limits?: Limits } & (
  | { kind: 'builtin'; algorithmId: string }
  | { kind: 'custom'; source: string }
)

export interface RunResponse {
  id: number
  result: RunResult
}
```

Create `src/worker/execute.ts`:

```ts
import { getAlgorithm } from '../algorithms'
import { DEFAULT_LIMITS } from '../core/limits'
import { runSort, type RunResult } from '../core/runner'
import { compileCustom } from './compile'
import type { RunRequest } from './protocol'

/** The one place a sort is actually executed. Never throws. */
export function execute(req: RunRequest): RunResult {
  const limits = req.limits ?? DEFAULT_LIMITS

  if (req.kind === 'builtin') {
    const algo = getAlgorithm(req.algorithmId)
    if (!algo) {
      return {
        ok: false,
        error: { code: 'not-a-function', message: `Unknown algorithm: ${req.algorithmId}` },
      }
    }
    return runSort(algo.sort, req.input, limits)
  }

  const compiled = compileCustom(req.source)
  if (!compiled.ok) return { ok: false, error: compiled.error }
  return runSort(compiled.fn, req.input, limits)
}
```

Create `src/worker/sortRunner.worker.ts`:

```ts
import { execute } from './execute'
import type { RunRequest, RunResponse } from './protocol'

// Deliberately trivial: all the logic lives in execute(), which is unit-tested.
self.addEventListener('message', (event: MessageEvent<RunRequest>) => {
  const req = event.data
  const response: RunResponse = { id: req.id, result: execute(req) }
  ;(self as unknown as Worker).postMessage(response)
})
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/worker/`
Expected: all passed.

- [ ] **Step 8: Write the failing test for the runner hook**

Create `src/worker/useRunner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRunner, type WorkerLike } from './useRunner'
import { execute } from './execute'
import type { RunRequest, RunResponse } from './protocol'

/** A synchronous stand-in for the real Worker, so the hook is testable in jsdom. */
function fakeWorker(): WorkerLike & { sent: RunRequest[] } {
  const listeners = new Set<(e: { data: RunResponse }) => void>()
  const sent: RunRequest[] = []
  return {
    sent,
    postMessage(m: unknown) {
      const req = m as RunRequest
      sent.push(req)
      const response: RunResponse = { id: req.id, result: execute(req) }
      for (const l of listeners) l({ data: response })
    },
    terminate() {},
    addEventListener(_t, l) {
      listeners.add(l)
    },
    removeEventListener(_t, l) {
      listeners.delete(l)
    },
  }
}

describe('useRunner', () => {
  it('resolves with the run result', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))

    let out: Awaited<ReturnType<typeof result.current.run>> | undefined
    await act(async () => {
      out = await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
    })

    expect(out?.ok).toBe(true)
    if (out?.ok) expect(out.finalArray).toEqual([1, 2])
  })

  it('gives each request a distinct id', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))
    await act(async () => {
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [3, 1] })
    })
    expect(worker.sent[0].id).not.toBe(worker.sent[1].id)
  })

  it('reports busy while a run is outstanding', async () => {
    const worker = fakeWorker()
    const { result } = renderHook(() => useRunner(() => worker))
    expect(result.current.busy).toBe(false)
    await act(async () => {
      await result.current.run({ kind: 'builtin', algorithmId: 'bubble', input: [2, 1] })
    })
    await waitFor(() => expect(result.current.busy).toBe(false))
  })
})
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run src/worker/useRunner.test.tsx`
Expected: FAIL — cannot find module `./useRunner`.

- [ ] **Step 10: Implement the runner hook**

Create `src/worker/useRunner.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunResult } from '../core/runner'
import type { RunRequest, RunResponse } from './protocol'

export interface WorkerLike {
  postMessage(m: unknown): void
  terminate(): void
  addEventListener(type: 'message', listener: (e: { data: RunResponse }) => void): void
  removeEventListener(type: 'message', listener: (e: { data: RunResponse }) => void): void
}

const defaultFactory = (): WorkerLike =>
  new Worker(new URL('./sortRunner.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike

/** Owns the worker and matches responses to requests by id. */
export function useRunner(createWorker: () => WorkerLike = defaultFactory) {
  const workerRef = useRef<WorkerLike | null>(null)
  const nextId = useRef(1)
  const pending = useRef(new Map<number, (r: RunResult) => void>())
  const [busy, setBusy] = useState(false)

  if (workerRef.current === null) workerRef.current = createWorker()

  useEffect(() => {
    const worker = workerRef.current!
    const onMessage = (e: { data: RunResponse }) => {
      const resolve = pending.current.get(e.data.id)
      if (!resolve) return // a stale response from a superseded run
      pending.current.delete(e.data.id)
      resolve(e.data.result)
      if (pending.current.size === 0) setBusy(false)
    }
    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const run = useCallback((req: Omit<RunRequest, 'id'>): Promise<RunResult> => {
    const id = nextId.current++
    setBusy(true)
    return new Promise<RunResult>((resolve) => {
      pending.current.set(id, resolve)
      workerRef.current!.postMessage({ ...req, id } as RunRequest)
    })
  }, [])

  return { run, busy }
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run src/worker/`
Expected: all passed.

Note: `useRunner` is exercised through a fake worker. The real `sortRunner.worker.ts` is four lines of message plumbing and is verified manually in Task 15 when the app first runs.

- [ ] **Step 12: Commit**

```bash
git add src/worker
git commit -m "feat(worker): execute every sort off the main thread"
```

---

### Task 12: Playback engine and hook

**Files:**
- Create: `src/player/timing.ts`, `src/player/engine.ts`, `src/player/usePlayer.ts`
- Test: `src/player/timing.test.ts`, `src/player/engine.test.ts`

**Interfaces:**
- Consumes: `Trace`, `FrameState`, `applyStep`, `createInitialState`, `stateAt`.
- Produces:
  - `function advance(dtMs: number, stepsPerSecond: number, carry: number, remaining: number): { steps: number; carry: number }`
  - `const MAX_STEPS_PER_FRAME = 50_000`, `const SPEEDS: readonly number[]`
  - `class PlayerEngine` — `constructor(trace)`, `frame`, `index`, `atEnd`, `seek(i)`, `stepBy(n)`, `tick(dtMs, stepsPerSecond)`, `onFrame(cb): () => void`
  - `function usePlayer(trace: Trace | null): { engine, index, playing, play, pause, toggle, stepForward, stepBack, toStart, toEnd, speed, setSpeed, total }`

- [ ] **Step 1: Write the failing tests for timing**

Create `src/player/timing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { advance, MAX_STEPS_PER_FRAME } from './timing'

describe('advance', () => {
  it('converts elapsed time into whole steps at the given rate', () => {
    expect(advance(1000, 60, 0, 10_000)).toEqual({ steps: 60, carry: 0 })
    expect(advance(500, 60, 0, 10_000).steps).toBe(30)
  })

  it('carries the fractional remainder between frames', () => {
    const first = advance(16, 60, 0, 1000)
    expect(first.steps).toBe(0)
    expect(first.carry).toBeCloseTo(0.96, 5)
    const second = advance(16, 60, first.carry, 1000)
    expect(second.steps).toBe(1)
    expect(second.carry).toBeCloseTo(0.92, 5)
  })

  it('never returns more steps than remain', () => {
    expect(advance(10_000, 1000, 0, 7).steps).toBe(7)
  })

  it('caps the work done in a single frame', () => {
    expect(advance(100_000, 10_000_000, 0, 10_000_000).steps).toBe(MAX_STEPS_PER_FRAME)
  })

  it('does nothing at zero speed', () => {
    expect(advance(1000, 0, 0, 100)).toEqual({ steps: 0, carry: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/player/timing.test.ts`
Expected: FAIL — cannot find module `./timing`.

- [ ] **Step 3: Implement timing**

Create `src/player/timing.ts`:

```ts
/** Steps per second offered by the speed control. The last is "as fast as it draws". */
export const SPEEDS: readonly number[] = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 50_000]

/** Beyond this, a single frame's work starts to feel like a hang. */
export const MAX_STEPS_PER_FRAME = 50_000

/** Converts elapsed wall-clock time into a whole number of steps, carrying the remainder. */
export function advance(
  dtMs: number,
  stepsPerSecond: number,
  carry: number,
  remaining: number,
): { steps: number; carry: number } {
  if (stepsPerSecond <= 0 || remaining <= 0) return { steps: 0, carry: 0 }
  const wanted = carry + (dtMs / 1000) * stepsPerSecond
  const whole = Math.floor(wanted)
  const steps = Math.min(whole, remaining, MAX_STEPS_PER_FRAME)
  return { steps, carry: wanted - whole }
}
```

- [ ] **Step 4: Write the failing tests for the engine**

Create `src/player/engine.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { PlayerEngine } from './engine'
import { runSort } from '../core/runner'
import { getAlgorithm } from '../algorithms'
import { generate } from '../core/generate'

const trace = () => {
  const algo = getAlgorithm('insertion')!
  const r = runSort(algo.sort, generate(24, 'random', 4))
  if (!r.ok) throw new Error('setup failed')
  return r.trace
}

describe('PlayerEngine', () => {
  it('starts at step 0 showing the input', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    expect(e.index).toBe(0)
    expect(Array.from(e.frame.main)).toEqual(t.input)
  })

  it('steps forward and backward to the same state', () => {
    const e = new PlayerEngine(trace())
    e.stepBy(50)
    const forward = Array.from(e.frame.main)
    e.stepBy(10)
    e.stepBy(-10)
    expect(Array.from(e.frame.main)).toEqual(forward)
  })

  it('clamps at both ends', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.stepBy(-5)
    expect(e.index).toBe(0)
    e.seek(t.steps.length + 1000)
    expect(e.index).toBe(t.steps.length)
    expect(e.atEnd).toBe(true)
  })

  it('ends on the fully sorted array', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.seek(t.steps.length)
    expect(Array.from(e.frame.main)).toEqual([...t.input].sort((a, b) => a - b))
  })

  it('tick advances by elapsed time and stops at the end', () => {
    const t = trace()
    const e = new PlayerEngine(t)
    e.tick(1000, 10)
    expect(e.index).toBe(10)
    e.tick(1_000_000, 1_000_000)
    expect(e.index).toBe(t.steps.length)
  })

  it('notifies subscribers when the frame changes, and stops after unsubscribe', () => {
    const e = new PlayerEngine(trace())
    const seen = vi.fn()
    const off = e.onFrame(seen)
    e.stepBy(5)
    expect(seen).toHaveBeenCalledTimes(1)
    off()
    e.stepBy(5)
    expect(seen).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/player/engine.test.ts`
Expected: FAIL — cannot find module `./engine`.

- [ ] **Step 6: Implement the engine**

Create `src/player/engine.ts`:

```ts
import { applyStep, type FrameState } from '../core/frame'
import { stateAt } from '../core/keyframes'
import type { Trace } from '../core/runner'
import { advance } from './timing'

/**
 * Walks a trace. Forward motion applies steps incrementally; anything else
 * restores the nearest keyframe. Framework-free so it can be tested directly.
 */
export class PlayerEngine {
  private state: FrameState
  private carry = 0
  private subscribers = new Set<(f: FrameState) => void>()

  constructor(readonly trace: Trace) {
    this.state = stateAt(trace, 0)
  }

  get frame(): FrameState {
    return this.state
  }

  get index(): number {
    return this.state.index
  }

  get total(): number {
    return this.trace.steps.length
  }

  get atEnd(): boolean {
    return this.state.index >= this.total
  }

  seek(index: number): void {
    const target = clamp(index, 0, this.total)
    if (target === this.state.index) return
    if (target > this.state.index) {
      this.applyForward(target - this.state.index)
    } else {
      this.state = stateAt(this.trace, target)
    }
    this.carry = 0
    this.emit()
  }

  stepBy(n: number): void {
    this.seek(this.state.index + n)
  }

  /** Advances by however many steps `dtMs` buys at `stepsPerSecond`. */
  tick(dtMs: number, stepsPerSecond: number): void {
    const remaining = this.total - this.state.index
    const { steps, carry } = advance(dtMs, stepsPerSecond, this.carry, remaining)
    this.carry = carry
    if (steps <= 0) return
    this.applyForward(steps)
    this.emit()
  }

  onFrame(cb: (f: FrameState) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private applyForward(count: number): void {
    const end = Math.min(this.state.index + count, this.total)
    for (let i = this.state.index; i < end; i++) applyStep(this.state, this.trace.steps[i])
  }

  private emit(): void {
    for (const cb of this.subscribers) cb(this.state)
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/player/`
Expected: all passed.

- [ ] **Step 8: Implement the React wrapper**

No test file — this is thin glue over the tested engine, and it is exercised end to end in Task 15.

Create `src/player/usePlayer.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../core/runner'
import { PlayerEngine } from './engine'
import { SPEEDS } from './timing'

/** How often the React-visible index updates. The canvas redraws every frame regardless. */
const UI_REFRESH_MS = 60

export function usePlayer(trace: Trace | null) {
  const engine = useMemo(() => (trace ? new PlayerEngine(trace) : null), [trace])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[6])
  const [index, setIndexState] = useState(0)
  const lastUiUpdate = useRef(0)

  // A new trace resets the transport.
  useEffect(() => {
    setIndexState(0)
    setPlaying(false)
  }, [engine])

  const syncIndex = useCallback(
    (force: boolean) => {
      if (!engine) return
      const now = performance.now()
      if (force || now - lastUiUpdate.current >= UI_REFRESH_MS) {
        lastUiUpdate.current = now
        setIndexState(engine.index)
      }
    },
    [engine],
  )

  useEffect(() => {
    if (!engine || !playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      engine.tick(dt, speed)
      syncIndex(false)
      if (engine.atEnd) {
        setPlaying(false)
        setIndexState(engine.index)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, playing, speed, syncIndex])

  const act = useCallback(
    (fn: (e: PlayerEngine) => void) => {
      if (!engine) return
      fn(engine)
      syncIndex(true)
    },
    [engine, syncIndex],
  )

  return {
    engine,
    index,
    total: engine?.total ?? 0,
    playing,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    seek: (i: number) => act((e) => e.seek(i)),
    stepForward: () => act((e) => e.stepBy(1)),
    stepBack: () => act((e) => e.stepBy(-1)),
    toStart: () => act((e) => e.seek(0)),
    toEnd: () => act((e) => e.seek(e.total)),
  }
}
```

- [ ] **Step 9: Verify the whole suite still passes**

Run: `npm test`
Expected: all passed.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/player
git commit -m "feat(player): add playback engine, timing, and React hook"
```

---

### Task 13: Design tokens, theme, and app shell

One source of truth for color: `theme.ts` holds the palette, and `applyTheme` writes it onto `:root` as CSS custom properties at startup. The canvas reads the object, the DOM reads the variables, and they cannot drift.

**Files:**
- Create: `src/render/theme.ts`, `src/styles/tokens.css`, `src/styles/global.css`
- Modify: `index.html` (fonts, title), `src/main.tsx`, `src/App.tsx`
- Delete: `src/App.css`, `src/index.css`, `src/assets/` (Vite template leftovers, if present)
- Test: `src/render/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Theme { bg, surface, surfaceAlt, hairline, text, muted, idle, compare, swap, pivot, sorted, aux, accent, danger }` — all `string`
  - `const DARK: Theme`
  - `function applyTheme(theme: Theme, root?: HTMLElement): void`
  - `function cssVarName(key: keyof Theme): string`

- [ ] **Step 1: Write the failing test**

Create `src/render/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { DARK, applyTheme, cssVarName } from './theme'

describe('theme', () => {
  it('names variables predictably', () => {
    expect(cssVarName('bg')).toBe('--c-bg')
    expect(cssVarName('surfaceAlt')).toBe('--c-surface-alt')
  })

  it('writes every palette entry onto the root element', () => {
    const root = document.createElement('div')
    applyTheme(DARK, root)
    for (const key of Object.keys(DARK) as Array<keyof typeof DARK>) {
      expect(root.style.getPropertyValue(cssVarName(key))).toBe(DARK[key])
    }
  })

  it('uses the specified ground color', () => {
    expect(DARK.bg).toBe('#0a0b0f')
  })

  it('gives every semantic role a distinct color', () => {
    const roles = [DARK.idle, DARK.compare, DARK.swap, DARK.pivot, DARK.sorted, DARK.aux]
    expect(new Set(roles).size).toBe(roles.length)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/theme.test.ts`
Expected: FAIL — cannot find module `./theme`.

- [ ] **Step 3: Implement the theme**

Create `src/render/theme.ts`:

```ts
export interface Theme {
  bg: string
  surface: string
  surfaceAlt: string
  hairline: string
  text: string
  muted: string
  idle: string
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/render/theme.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the structural tokens**

Create `src/styles/tokens.css`:

```css
:root {
  /* Colors are injected by applyTheme() as --c-* at startup. */

  --font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'Consolas', monospace;

  --fs-micro: 10px;
  --fs-small: 11px;
  --fs-body: 13px;
  --fs-lead: 15px;
  --fs-display: 22px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --radius: 4px;
  --hairline: 1px solid var(--c-hairline);

  --track-height: 3px;
  --control-height: 30px;
}
```

- [ ] **Step 6: Write the global stylesheet**

Create `src/styles/global.css`:

```css
@import './tokens.css';

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  -webkit-font-smoothing: antialiased;
}

/* Numbers are mono and tabular so climbing counters never shift the layout. */
.mono,
.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.label {
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.panel {
  background: var(--c-surface);
  border: var(--hairline);
  border-radius: var(--radius);
}

button {
  font: inherit;
  color: var(--c-text);
  background: var(--c-surfaceAlt, var(--c-surface-alt));
  border: var(--hairline);
  border-radius: var(--radius);
  height: var(--control-height);
  padding: 0 var(--space-3);
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--c-accent);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

button[aria-pressed='true'] {
  border-color: var(--c-accent);
  color: var(--c-accent);
}

select,
input[type='number'],
input[type='text'] {
  font-family: var(--font-mono);
  font-size: var(--fs-small);
  color: var(--c-text);
  background: var(--c-bg);
  border: var(--hairline);
  border-radius: var(--radius);
  height: var(--control-height);
  padding: 0 var(--space-2);
}

input[type='range'] {
  accent-color: var(--c-accent);
  width: 100%;
}

:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 1px;
}

/* The app shell: a fixed left rail, the stage, and a right inspector. */
.app {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 320px;
  grid-template-rows: 48px minmax(0, 1fr) auto;
  grid-template-areas:
    'head head head'
    'rail stage inspector'
    'rail controls inspector';
  height: 100%;
}

.app__head {
  grid-area: head;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-4);
  border-bottom: var(--hairline);
}

.app__rail {
  grid-area: rail;
  overflow-y: auto;
  border-right: var(--hairline);
}

.app__stage {
  grid-area: stage;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.app__controls {
  grid-area: controls;
  border-top: var(--hairline);
  padding: var(--space-3) var(--space-4);
}

.app__inspector {
  grid-area: inspector;
  overflow-y: auto;
  border-left: var(--hairline);
}

.wordmark {
  font-family: var(--font-mono);
  font-size: var(--fs-lead);
  letter-spacing: -0.02em;
}

.wordmark span {
  color: var(--c-accent);
}

@media (max-width: 1100px) {
  .app {
    grid-template-columns: 220px minmax(0, 1fr);
    grid-template-areas:
      'head head'
      'rail stage'
      'rail controls'
      'inspector inspector';
  }

  .app__inspector {
    border-left: none;
    border-top: var(--hairline);
  }
}
```

- [ ] **Step 7: Wire up the entry point and shell**

Replace `index.html` `<head>` contents with a title and the fonts:

```html
    <title>Sorting Visualizer</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
```

Replace `src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, DARK } from './render/theme'
import './styles/global.css'

applyTheme(DARK)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Replace `src/App.tsx` with the shell (regions are filled in over the next tasks):

```tsx
export default function App() {
  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
      </header>
      <nav className="app__rail" aria-label="Algorithms" />
      <main className="app__stage" />
      <section className="app__controls" />
      <aside className="app__inspector" />
    </div>
  )
}
```

Delete any Vite template leftovers. Task 1 scaffolded by hand, so these usually do
not exist — the command is a no-op in that case, which is fine:

```bash
rm -f src/App.css src/index.css
rm -rf src/assets
```

- [ ] **Step 8: Verify the shell renders**

Run: `npm run dev`, open the printed URL.
Expected: a near-black page with the wordmark in the header and hairline-separated empty regions. No console errors.

Run: `npm test`
Expected: all passed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): add theme tokens and app shell"
```

---

### Task 14: Bar renderer and canvas surface

**Files:**
- Create: `src/render/layout.ts`, `src/render/bars.ts`, `src/render/index.ts`, `src/components/Canvas.tsx`
- Test: `src/render/layout.test.ts`

**Interfaces:**
- Consumes: `FrameState`, `Theme`, `PlayerEngine`.
- Produces:
  - `interface PlotArea { x: number; y: number; w: number; h: number }`
  - `interface Size { width: number; height: number }`
  - `type Renderer = (ctx: CanvasRenderingContext2D, frame: FrameState, theme: Theme, size: Size) => void`
  - `function splitLanes(size: Size, hasAux: boolean): { main: PlotArea; aux: PlotArea | null }`
  - `function barMetrics(area: PlotArea, n: number): { barWidth: number; gap: number; slot: number }`
  - `function heat(index: number, lastTouched: number): number` — 1 just touched, 0 fully faded
  - `const DECAY_STEPS = 24`
  - `function elementColor(i, frame, theme): string`
  - `const RENDERERS: ReadonlyArray<{ id: RenderStyle; label: string; draw: Renderer }>`, `type RenderStyle = 'bars' | 'dots' | 'rainbow' | 'pyramid'`, `function getRenderer(id: RenderStyle): Renderer`
  - `<Canvas engine={PlayerEngine | null} style={RenderStyle} theme={Theme} />`

- [ ] **Step 1: Write the failing tests**

Create `src/render/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { barMetrics, DECAY_STEPS, heat, splitLanes } from './layout'

describe('splitLanes', () => {
  it('gives the whole area to the main lane when there is no aux buffer', () => {
    const { main, aux } = splitLanes({ width: 800, height: 400 }, false)
    expect(aux).toBeNull()
    expect(main.h).toBeGreaterThan(350)
    expect(main.w).toBeLessThanOrEqual(800)
  })

  it('reserves a strip below for the aux buffer', () => {
    const { main, aux } = splitLanes({ width: 800, height: 400 }, true)
    expect(aux).not.toBeNull()
    expect(aux!.y).toBeGreaterThan(main.y + main.h - 1)
    expect(aux!.h).toBeLessThan(main.h)
  })
})

describe('barMetrics', () => {
  it('fills the width without overflowing', () => {
    const area = { x: 0, y: 0, w: 1000, h: 100 }
    const m = barMetrics(area, 50)
    expect(m.slot * 50).toBeLessThanOrEqual(1000 + 0.001)
    expect(m.barWidth).toBeGreaterThan(0)
    expect(m.barWidth).toBeLessThanOrEqual(m.slot)
  })

  it('drops the gap entirely when bars get thin', () => {
    const area = { x: 0, y: 0, w: 300, h: 100 }
    expect(barMetrics(area, 1000).gap).toBe(0)
  })

  it('never returns a sub-pixel bar width', () => {
    const area = { x: 0, y: 0, w: 100, h: 100 }
    expect(barMetrics(area, 1000).barWidth).toBeGreaterThanOrEqual(1)
  })
})

describe('heat', () => {
  it('is 1 at the moment of the touch and 0 once decayed', () => {
    expect(heat(100, 100)).toBe(1)
    expect(heat(100 + DECAY_STEPS, 100)).toBe(0)
    expect(heat(100, -1_000_000)).toBe(0)
  })

  it('falls off monotonically', () => {
    const a = heat(105, 100)
    const b = heat(110, 100)
    expect(a).toBeGreaterThan(b)
  })

  it('never goes negative or above 1', () => {
    expect(heat(50, 100)).toBeLessThanOrEqual(1)
    expect(heat(10_000, 100)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/layout.test.ts`
Expected: FAIL — cannot find module `./layout`.

- [ ] **Step 3: Implement layout**

Create `src/render/layout.ts`:

```ts
import type { FrameState } from '../core/frame'
import type { Theme } from './theme'

export interface PlotArea {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  width: number
  height: number
}

export type Renderer = (
  ctx: CanvasRenderingContext2D,
  frame: FrameState,
  theme: Theme,
  size: Size,
) => void

const PAD = 12
const AUX_FRACTION = 0.26
const LANE_GAP = 10

export function splitLanes(size: Size, hasAux: boolean): { main: PlotArea; aux: PlotArea | null } {
  const x = PAD
  const w = Math.max(1, size.width - PAD * 2)
  const usable = Math.max(1, size.height - PAD * 2)

  if (!hasAux) {
    return { main: { x, y: PAD, w, h: usable }, aux: null }
  }
  const auxH = Math.round(usable * AUX_FRACTION)
  const mainH = usable - auxH - LANE_GAP
  return {
    main: { x, y: PAD, w, h: mainH },
    aux: { x, y: PAD + mainH + LANE_GAP, w, h: auxH },
  }
}

export function barMetrics(
  area: PlotArea,
  n: number,
): { barWidth: number; gap: number; slot: number } {
  if (n <= 0) return { barWidth: 0, gap: 0, slot: 0 }
  const slot = area.w / n
  // Below ~3px per element a gap costs more than it communicates.
  const gap = slot >= 3 ? Math.min(2, slot * 0.18) : 0
  return { barWidth: Math.max(1, slot - gap), gap, slot }
}

/** How recently element `i` was touched: 1 at the touch, 0 once DECAY_STEPS have passed. */
export const DECAY_STEPS = 24

export function heat(index: number, lastTouched: number): number {
  const age = index - lastTouched
  if (age < 0 || age >= DECAY_STEPS) return 0
  return 1 - age / DECAY_STEPS
}

/** The single place that decides what color an element is. */
export function elementColor(i: number, frame: FrameState, theme: Theme): string {
  if (i === frame.pivot) return theme.pivot
  const write = heat(frame.index, frame.lastWrite[i])
  if (write > 0) return mix(theme.idle, theme.swap, 0.35 + 0.65 * write)
  const cmp = heat(frame.index, frame.lastCompare[i])
  if (cmp > 0) return mix(theme.idle, theme.compare, 0.35 + 0.65 * cmp)
  if (frame.sorted[i]) return theme.sorted
  if (frame.range && (i < frame.range[0] || i > frame.range[1])) return dim(theme.idle)
  return theme.idle
}

function mix(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * clamp01(t)))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function dim(color: string): string {
  const [r, g, b] = parseHex(color)
  return `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(b * 0.55)})`
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/render/layout.test.ts`
Expected: all passed.

- [ ] **Step 5: Implement the bar renderer**

Create `src/render/bars.ts`:

```ts
import { barMetrics, elementColor, splitLanes, type Renderer } from './layout'

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
```

- [ ] **Step 6: Create the renderer registry**

Create `src/render/index.ts`:

```ts
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
```

Dots, rainbow and pyramid join this list in Task 16.

- [ ] **Step 7: Implement the canvas component**

Create `src/components/Canvas.tsx`:

```tsx
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
```

- [ ] **Step 8: Verify**

Run: `npm test`
Expected: all passed.

Run: `npm run typecheck`
Expected: no errors.

There is nothing to see in the browser yet — Task 15 mounts the canvas.

- [ ] **Step 9: Commit**

```bash
git add src/render src/components
git commit -m "feat(render): add layout math, bar renderer, and canvas surface"
```

---

### Task 15: The working single-run app

At the end of this task the app runs a built-in algorithm end to end through the real Worker: pick, generate, run, play, scrub, read counters.

**Files:**
- Create: `src/components/Controls.tsx`, `src/components/Telemetry.tsx`, `src/components/AlgorithmPicker.tsx`, `src/components/ArrayConfig.tsx`, `src/components/ErrorBanner.tsx`, `src/styles/components.css`
- Modify: `src/App.tsx`, `src/styles/global.css` (import components.css)
- Test: `src/components/Controls.test.tsx`, `src/components/Telemetry.test.tsx`, `src/components/ErrorBanner.test.tsx`

**Interfaces:**
- Consumes: `usePlayer`, `useRunner`, `ALGORITHMS`, `algorithmsByFamily`, `getAlgorithm`, `generate`, `DISTRIBUTIONS`, `MIN_N`, `MAX_N`, `LARGE_N_WARNING`, `SPEEDS`, `Canvas`, `DARK`, `RunError`, `Counts`.
- Produces:
  - `<Controls playing total index speed onToggle onStep onSeek onSpeed disabled />`
  - `<Telemetry counts total index sorted algorithm />`
  - `<AlgorithmPicker selectedId onSelect />`
  - `<ArrayConfig size distribution seed style onChange onRegenerate busy />`
  - `<ErrorBanner error onDismiss />`
  - `function formatCount(n: number): string`

- [ ] **Step 1: Write the failing component tests**

Create `src/components/ErrorBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBanner from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorBanner error={null} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains a step-budget failure as a likely infinite loop', () => {
    render(
      <ErrorBanner
        error={{ code: 'step-budget', message: 'Exceeded the 2000000 step limit', limit: 2_000_000 }}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/infinite loop/i)
  })

  it('shows the line number when there is one', () => {
    render(
      <ErrorBanner
        error={{ code: 'runtime', message: 'x is not defined', line: 7 }}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('line 7')
    expect(screen.getByRole('alert').textContent).toContain('x is not defined')
  })

  it('can be dismissed', async () => {
    const onDismiss = vi.fn()
    render(<ErrorBanner error={{ code: 'syntax', message: 'bad' }} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
```

Create `src/components/Telemetry.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Telemetry, { formatCount } from './Telemetry'
import { getAlgorithm } from '../algorithms'

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1234)).toBe('1,234')
    expect(formatCount(1_234_567)).toBe('1,234,567')
  })
})

describe('Telemetry', () => {
  const counts = { reads: 5, writes: 6, compares: 1234, swaps: 8 }

  it('shows every counter', () => {
    render(
      <Telemetry
        counts={counts}
        index={10}
        total={100}
        sorted
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('count-compares').textContent).toBe('1,234')
    expect(screen.getByTestId('count-swaps').textContent).toBe('8')
    expect(screen.getByTestId('count-reads').textContent).toBe('5')
    expect(screen.getByTestId('count-writes').textContent).toBe('6')
  })

  it('shows the algorithm complexity and stability', () => {
    render(
      <Telemetry counts={counts} index={0} total={1} sorted algorithm={getAlgorithm('heap')!} />,
    )
    expect(screen.getByTestId('complexity-average').textContent).toContain('O(n log n)')
    expect(screen.getByText(/unstable/i)).toBeTruthy()
  })

  it('reports the correctness verdict', () => {
    const { rerender } = render(
      <Telemetry counts={counts} index={1} total={1} sorted algorithm={getAlgorithm('bubble')!} />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/sorted/i)
    rerender(
      <Telemetry
        counts={counts}
        index={1}
        total={1}
        sorted={false}
        algorithm={getAlgorithm('bubble')!}
      />,
    )
    expect(screen.getByTestId('verdict').textContent).toMatch(/not sorted/i)
  })
})
```

Create `src/components/Controls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Controls from './Controls'

const props = () => ({
  playing: false,
  index: 10,
  total: 100,
  speed: 100,
  disabled: false,
  onToggle: vi.fn(),
  onStep: vi.fn(),
  onSeek: vi.fn(),
  onSpeed: vi.fn(),
})

describe('Controls', () => {
  it('toggles playback', async () => {
    const p = props()
    render(<Controls {...p} />)
    await userEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(p.onToggle).toHaveBeenCalledOnce()
  })

  it('labels the button pause while playing', () => {
    render(<Controls {...props()} playing />)
    expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy()
  })

  it('steps forward and backward by one', async () => {
    const p = props()
    render(<Controls {...p} />)
    await userEvent.click(screen.getByRole('button', { name: /step forward/i }))
    await userEvent.click(screen.getByRole('button', { name: /step back/i }))
    expect(p.onStep).toHaveBeenNthCalledWith(1, 1)
    expect(p.onStep).toHaveBeenNthCalledWith(2, -1)
  })

  it('shows the step position', () => {
    render(<Controls {...props()} />)
    expect(screen.getByTestId('position').textContent).toBe('10 / 100')
  })

  it('disables everything when there is no trace', () => {
    render(<Controls {...props()} disabled />)
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ErrorBanner**

Create `src/components/ErrorBanner.tsx`:

```tsx
import type { RunError } from '../core/runner'

const EXPLANATIONS: Record<RunError['code'], string> = {
  syntax: 'Your code could not be parsed.',
  runtime: 'Your code threw while running.',
  timeout: 'Your code ran past the time limit without finishing.',
  'step-budget':
    'Your code did too many array operations — this is almost always an infinite loop.',
  'not-a-function': 'No sort function was found.',
}

interface Props {
  error: RunError | null
  onDismiss: () => void
}

export default function ErrorBanner({ error, onDismiss }: Props) {
  if (!error) return null
  return (
    <div className="banner" role="alert">
      <div className="banner__body">
        <span className="banner__code label">{error.code}</span>
        <span>{EXPLANATIONS[error.code]}</span>
        <span className="banner__detail mono">
          {error.line !== undefined ? `line ${error.line}: ` : ''}
          {error.message}
        </span>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Implement Telemetry**

Create `src/components/Telemetry.tsx`:

```tsx
import type { Algorithm } from '../algorithms'
import type { Counts } from '../core/types'

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

interface Props {
  counts: Counts
  index: number
  total: number
  sorted: boolean
  algorithm: Algorithm
}

const COUNTERS: ReadonlyArray<[keyof Counts, string]> = [
  ['compares', 'compares'],
  ['swaps', 'swaps'],
  ['reads', 'reads'],
  ['writes', 'writes'],
]

export default function Telemetry({ counts, index, total, sorted, algorithm }: Props) {
  const { meta } = algorithm
  return (
    <div className="inspector">
      <section className="inspector__block">
        <div className="label">algorithm</div>
        <h2 className="inspector__name">{meta.name}</h2>
        <p className="inspector__desc">{meta.description}</p>
        <div className="chips">
          <span className="chip">{meta.stable ? 'stable' : 'unstable'}</span>
          <span className="chip">{meta.inPlace ? 'in place' : 'out of place'}</span>
        </div>
      </section>

      <section className="inspector__block">
        <div className="label">complexity</div>
        <dl className="grid2">
          <dt>best</dt>
          <dd className="mono" data-testid="complexity-best">
            {meta.best}
          </dd>
          <dt>average</dt>
          <dd className="mono" data-testid="complexity-average">
            {meta.average}
          </dd>
          <dt>worst</dt>
          <dd className="mono" data-testid="complexity-worst">
            {meta.worst}
          </dd>
          <dt>space</dt>
          <dd className="mono" data-testid="complexity-space">
            {meta.space}
          </dd>
        </dl>
      </section>

      <section className="inspector__block">
        <div className="label">telemetry</div>
        <dl className="grid2">
          {COUNTERS.map(([key, label]) => (
            <div className="readout" key={key}>
              <dt>{label}</dt>
              <dd className="num" data-testid={`count-${key}`}>
                {formatCount(counts[key])}
              </dd>
            </div>
          ))}
          <div className="readout">
            <dt>steps</dt>
            <dd className="num">
              {formatCount(index)} / {formatCount(total)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="inspector__block">
        <div className="label">result</div>
        <span
          className={`chip chip--${sorted ? 'ok' : 'bad'}`}
          data-testid="verdict"
        >
          {sorted ? 'sorted' : 'not sorted'}
        </span>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Implement Controls**

Create `src/components/Controls.tsx`:

```tsx
import { SPEEDS } from '../player/timing'
import { formatCount } from './Telemetry'

interface Props {
  playing: boolean
  index: number
  total: number
  speed: number
  disabled: boolean
  onToggle: () => void
  onStep: (delta: number) => void
  onSeek: (index: number) => void
  onSpeed: (speed: number) => void
}

export default function Controls({
  playing,
  index,
  total,
  speed,
  disabled,
  onToggle,
  onStep,
  onSeek,
  onSpeed,
}: Props) {
  const speedIndex = Math.max(0, SPEEDS.indexOf(speed))
  return (
    <div className="controls">
      <div className="controls__transport">
        <button onClick={() => onSeek(0)} disabled={disabled} aria-label="Jump to start">
          |◀
        </button>
        <button onClick={() => onStep(-1)} disabled={disabled} aria-label="Step back">
          ◀
        </button>
        <button onClick={onToggle} disabled={disabled} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚ pause' : '▶ play'}
        </button>
        <button onClick={() => onStep(1)} disabled={disabled} aria-label="Step forward">
          ▶
        </button>
        <button onClick={() => onSeek(total)} disabled={disabled} aria-label="Jump to end">
          ▶|
        </button>
        <span className="num controls__position" data-testid="position">
          {formatCount(index)} / {formatCount(total)}
        </span>
      </div>

      <label className="controls__scrub">
        <span className="label">timeline</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          value={index}
          disabled={disabled}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Timeline"
        />
      </label>

      <label className="controls__speed">
        <span className="label">speed {formatCount(speed)}/s</span>
        <input
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          value={speedIndex}
          disabled={disabled}
          onChange={(e) => onSpeed(SPEEDS[Number(e.target.value)])}
          aria-label="Speed"
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 6: Implement AlgorithmPicker and ArrayConfig**

Create `src/components/AlgorithmPicker.tsx`:

```tsx
import { algorithmsByFamily } from '../algorithms'

interface Props {
  selectedId: string
  onSelect: (id: string) => void
}

export default function AlgorithmPicker({ selectedId, onSelect }: Props) {
  return (
    <div className="picker">
      {algorithmsByFamily().map((group) => (
        <section key={group.family} className="picker__group">
          <div className="label picker__label">{group.label}</div>
          <ul className="picker__list">
            {group.items.map((algo) => (
              <li key={algo.meta.id}>
                <button
                  className="picker__item"
                  aria-pressed={algo.meta.id === selectedId}
                  onClick={() => onSelect(algo.meta.id)}
                >
                  <span className="picker__name">{algo.meta.name}</span>
                  <span className="picker__badge mono">{algo.meta.average}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

Create `src/components/ArrayConfig.tsx`:

```tsx
import { DISTRIBUTIONS, LARGE_N_WARNING, MAX_N, MIN_N, type Distribution } from '../core/generate'
import { RENDERERS, type RenderStyle } from '../render'

export interface ArraySettings {
  size: number
  distribution: Distribution
  seed: number
  style: RenderStyle
}

interface Props {
  settings: ArraySettings
  busy: boolean
  onChange: (next: ArraySettings) => void
  onRegenerate: () => void
}

export default function ArrayConfig({ settings, busy, onChange, onRegenerate }: Props) {
  const set = <K extends keyof ArraySettings>(key: K, value: ArraySettings[K]) =>
    onChange({ ...settings, [key]: value })

  return (
    <div className="config">
      <label className="config__row">
        <span className="label">size {settings.size}</span>
        <input
          type="range"
          min={MIN_N}
          max={MAX_N}
          value={settings.size}
          onChange={(e) => set('size', Number(e.target.value))}
          aria-label="Array size"
        />
      </label>
      {settings.size > LARGE_N_WARNING && (
        <p className="config__warn">
          Above {LARGE_N_WARNING} elements, quadratic algorithms may exceed the step limit.
        </p>
      )}

      <label className="config__row">
        <span className="label">distribution</span>
        <select
          value={settings.distribution}
          onChange={(e) => set('distribution', e.target.value as Distribution)}
          aria-label="Distribution"
        >
          {DISTRIBUTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="config__row">
        <span className="label">seed</span>
        <input
          type="number"
          value={settings.seed}
          onChange={(e) => set('seed', Number(e.target.value))}
          aria-label="Seed"
        />
      </label>

      <label className="config__row">
        <span className="label">render</span>
        <select
          value={settings.style}
          onChange={(e) => set('style', e.target.value as RenderStyle)}
          aria-label="Render style"
        >
          {RENDERERS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <button onClick={onRegenerate} disabled={busy}>
        {busy ? 'running…' : 'regenerate & run'}
      </button>
    </div>
  )
}
```

- [ ] **Step 7: Add the component stylesheet**

Create `src/styles/components.css`:

```css
.picker__group {
  padding: var(--space-3) 0;
  border-bottom: var(--hairline);
}

.picker__label {
  padding: 0 var(--space-4) var(--space-2);
}

.picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.picker__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 28px;
  padding: 0 var(--space-4);
  background: none;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 0;
  text-align: left;
}

.picker__item:hover {
  background: var(--c-surface);
}

.picker__item[aria-pressed='true'] {
  background: var(--c-surface);
  border-left-color: var(--c-accent);
}

.picker__badge {
  font-size: var(--fs-micro);
  color: var(--c-muted);
}

.config {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: var(--hairline);
}

.config__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config__warn {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--c-compare);
}

.controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 180px;
  align-items: center;
  gap: var(--space-4);
}

.controls__transport {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.controls__position {
  margin-left: var(--space-3);
  font-size: var(--fs-small);
  color: var(--c-muted);
}

.controls__scrub,
.controls__speed {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.inspector__block {
  padding: var(--space-4);
  border-bottom: var(--hairline);
}

.inspector__name {
  margin: var(--space-2) 0;
  font-size: var(--fs-display);
  font-weight: 500;
  letter-spacing: -0.02em;
}

.inspector__desc {
  margin: 0 0 var(--space-3);
  color: var(--c-muted);
  line-height: 1.5;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2) var(--space-4);
  margin: 0;
}

.grid2 dt {
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--c-muted);
}

.grid2 dd {
  margin: 0;
}

.readout dd {
  font-size: var(--fs-lead);
}

.chips {
  display: flex;
  gap: var(--space-2);
}

.chip {
  display: inline-block;
  padding: 2px var(--space-2);
  border: var(--hairline);
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--c-muted);
}

.chip--ok {
  color: var(--c-sorted);
  border-color: var(--c-sorted);
}

.chip--bad {
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.banner {
  position: absolute;
  inset: var(--space-4) var(--space-4) auto;
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--c-surface);
  border: 1px solid var(--c-danger);
  border-radius: var(--radius);
}

.banner__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.banner__code {
  color: var(--c-danger);
}

.banner__detail {
  font-size: var(--fs-small);
  color: var(--c-muted);
}
```

Add to the top of `src/styles/global.css`, after the tokens import:

```css
@import './components.css';
```

- [ ] **Step 8: Wire the app together**

Replace `src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import AlgorithmPicker from './components/AlgorithmPicker'
import ArrayConfig, { type ArraySettings } from './components/ArrayConfig'
import Canvas from './components/Canvas'
import Controls from './components/Controls'
import ErrorBanner from './components/ErrorBanner'
import Telemetry from './components/Telemetry'
import { getAlgorithm } from './algorithms'
import { generate } from './core/generate'
import type { RunError, Trace } from './core/runner'
import { usePlayer } from './player/usePlayer'
import { DARK } from './render/theme'
import { useRunner } from './worker/useRunner'

const DEFAULT_SETTINGS: ArraySettings = {
  size: 64,
  distribution: 'random',
  seed: 1,
  style: 'bars',
}

export default function App() {
  const [algorithmId, setAlgorithmId] = useState('quick-lomuto')
  const [settings, setSettings] = useState<ArraySettings>(DEFAULT_SETTINGS)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [sorted, setSorted] = useState(true)
  const [error, setError] = useState<RunError | null>(null)

  const { run, busy } = useRunner()
  const player = usePlayer(trace)
  const algorithm = getAlgorithm(algorithmId)!

  const start = useCallback(
    async (id: string, s: ArraySettings) => {
      const cap = getAlgorithm(id)?.meta.maxN
      const size = cap ? Math.min(s.size, cap) : s.size
      const input = generate(Math.max(8, size), s.distribution, s.seed)
      const result = await run({ kind: 'builtin', algorithmId: id, input })
      if (result.ok) {
        setError(null)
        setSorted(result.sorted)
        setTrace(result.trace)
      } else {
        setError(result.error)
        setTrace(null)
      }
    },
    [run],
  )

  // Re-run whenever the algorithm or the input definition changes.
  useEffect(() => {
    void start(algorithmId, settings)
  }, [algorithmId, settings, start])

  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
      </header>

      <nav className="app__rail" aria-label="Algorithms">
        <ArrayConfig
          settings={settings}
          busy={busy}
          onChange={setSettings}
          onRegenerate={() => setSettings((s) => ({ ...s, seed: s.seed + 1 }))}
        />
        <AlgorithmPicker selectedId={algorithmId} onSelect={setAlgorithmId} />
      </nav>

      <main className="app__stage">
        <Canvas engine={player.engine} style={settings.style} theme={DARK} />
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      </main>

      <section className="app__controls">
        <Controls
          playing={player.playing}
          index={player.index}
          total={player.total}
          speed={player.speed}
          disabled={!trace}
          onToggle={player.toggle}
          onStep={(d) => (d > 0 ? player.stepForward() : player.stepBack())}
          onSeek={player.seek}
          onSpeed={player.setSpeed}
        />
      </section>

      <aside className="app__inspector">
        <Telemetry
          counts={player.engine?.frame.counts ?? { reads: 0, writes: 0, compares: 0, swaps: 0 }}
          index={player.index}
          total={player.total}
          sorted={sorted}
          algorithm={algorithm}
        />
      </aside>
    </div>
  )
}
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run src/components/`
Expected: all passed.

Run: `npm test`
Expected: all passed.

- [ ] **Step 10: Verify the app end to end in the browser**

Run: `npm run dev` and open the URL. Confirm each of these by hand:

1. Bars appear immediately for quicksort on 64 random elements.
2. Play animates; pause stops; the scrubber follows.
3. Dragging the scrubber backwards redraws correctly (this exercises keyframe seeking).
4. Step forward then step back returns to the same picture.
5. Selecting merge sort shows the aux lane beneath the main bars.
6. Counters climb and the verdict chip reads "sorted".
7. Setting size to 900 and choosing bubble sort produces the step-budget banner rather than a frozen tab. **This is the proof the Worker path works.**
8. No console errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(ui): wire the single-run visualizer end to end"
```

---

### Task 16: The remaining render styles

**Files:**
- Create: `src/render/dots.ts`, `src/render/rainbow.ts`, `src/render/pyramid.ts`
- Modify: `src/render/index.ts` (register all four)
- Test: `src/render/index.test.ts`

**Interfaces:**
- Consumes: `Renderer`, `splitLanes`, `barMetrics`, `elementColor`, `heat`.
- Produces: `drawDots`, `drawRainbow`, `drawPyramid`; `RENDERERS` grows to four entries.

- [ ] **Step 1: Write the failing test**

Create `src/render/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RENDERERS, getRenderer } from './index'
import { createInitialState } from '../core/frame'
import { DARK } from './theme'

/** A minimal 2D context recorder — enough to prove a renderer draws without a browser. */
function fakeCtx() {
  const calls: string[] = []
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === 'calls') return calls
      if (prop === 'canvas') return { width: 800, height: 400 }
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.length})`)
      }
    },
    set() {
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D & { calls: string[] }
}

describe('renderer registry', () => {
  it('registers all four styles', () => {
    expect(RENDERERS.map((r) => r.id)).toEqual(['bars', 'dots', 'rainbow', 'pyramid'])
  })

  it('falls back to bars for an unknown id', () => {
    expect(getRenderer('nope' as never)).toBe(RENDERERS[0].draw)
  })

  it.each(RENDERERS.map((r) => [r.id, r.draw] as const))('%s draws something', (_id, draw) => {
    const ctx = fakeCtx()
    const frame = createInitialState([3, 1, 4, 1, 5, 9, 2, 6], 0)
    draw(ctx, frame, DARK, { width: 800, height: 400 })
    expect((ctx as unknown as { calls: string[] }).calls.length).toBeGreaterThan(0)
  })

  it.each(RENDERERS.map((r) => [r.id, r.draw] as const))(
    '%s survives an empty array',
    (_id, draw) => {
      const ctx = fakeCtx()
      const frame = createInitialState([], 0)
      expect(() => draw(ctx, frame, DARK, { width: 800, height: 400 })).not.toThrow()
    },
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/render/index.test.ts`
Expected: FAIL — only one style registered.

- [ ] **Step 3: Implement the dot renderer**

Create `src/render/dots.ts`:

```ts
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
```

- [ ] **Step 4: Implement the rainbow renderer**

Create `src/render/rainbow.ts`:

```ts
import { barMetrics, heat, splitLanes, type Renderer } from './layout'

/**
 * Hue encodes value, so a sorted array is a clean spectrum sweep and any
 * remaining disorder shows up as a visible tear in the gradient.
 */
export const drawRainbow: Renderer = (ctx, frame, theme, size) => {
  ctx.clearRect(0, 0, size.width, size.height)
  const { main } = splitLanes(size, false)
  const n = frame.main.length
  if (n === 0) return

  let max = 1
  for (let i = 0; i < n; i++) if (frame.main[i] > max) max = frame.main[i]

  const m = barMetrics(main, n)
  for (let i = 0; i < n; i++) {
    const hue = Math.round((frame.main[i] / max) * 330)
    const touched = Math.max(heat(frame.index, frame.lastWrite[i]), heat(frame.index, frame.lastCompare[i]))
    const light = 45 + touched * 35
    ctx.fillStyle = `hsl(${hue}, 78%, ${light}%)`
    ctx.fillRect(main.x + i * m.slot, main.y, Math.max(1, m.slot), main.h)
  }

  if (frame.pivot >= 0) {
    ctx.fillStyle = theme.text
    ctx.fillRect(main.x + frame.pivot * m.slot, main.y, Math.max(1, m.slot), 3)
  }
}
```

- [ ] **Step 5: Implement the pyramid renderer**

Create `src/render/pyramid.ts`:

```ts
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
```

- [ ] **Step 6: Register all four**

Replace the registry body in `src/render/index.ts`:

```ts
import { drawBars } from './bars'
import { drawDots } from './dots'
import { drawPyramid } from './pyramid'
import { drawRainbow } from './rainbow'
import type { Renderer } from './layout'

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

export type { Renderer, Size, PlotArea } from './layout'
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/render/`
Expected: all passed.

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev`. Switch the render selector through all four styles while a sort plays. Each should animate without flicker or overflow.

- [ ] **Step 9: Commit**

```bash
git add src/render
git commit -m "feat(render): add dots, rainbow, and pyramid styles"
```

---

### Task 17: Custom code

The feature that separates this from every other sorting visualizer: the user writes a sort and watches it run through the same pipeline as the built-ins.

**Files:**
- Create: `src/customCode.ts`, `src/components/apiEntries.ts`, `src/components/ApiReference.tsx`, `src/components/CodeMirrorEditor.tsx`, `src/components/CodePanel.tsx`
- Modify: `src/App.tsx` (mode switch), `src/styles/components.css`
- Test: `src/customCode.test.ts`, `src/components/apiEntries.test.ts`

**Interfaces:**
- Consumes: `useRunner`, `execute` path via worker, `getAlgorithm`, `ALGORITHMS`, `RunError`, `TrackedArray` (type only, for the doc test).
- Produces:
  - `const DEFAULT_SOURCE: string`
  - `function loadDraft(): string`, `function saveDraft(source: string): void`, `const DRAFT_KEY = 'sortviz.draft'`
  - `interface ApiEntry { member: string; signature: string; description: string }`, `const API_ENTRIES: readonly ApiEntry[]`
  - `<ApiReference />`
  - `<CodeMirrorEditor value onChange />`
  - `<CodePanel source onSourceChange onRun busy error />`

- [ ] **Step 1: Install the editor packages**

```bash
npm install @codemirror/commands
```

(`codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-javascript` and `@codemirror/theme-one-dark` were installed in Task 1.)

- [ ] **Step 2: Write the failing tests**

Create `src/customCode.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SOURCE, DRAFT_KEY, loadDraft, saveDraft } from './customCode'

describe('draft persistence', () => {
  beforeEach(() => localStorage.clear())

  it('returns the default source when nothing is stored', () => {
    expect(loadDraft()).toBe(DEFAULT_SOURCE)
  })

  it('round-trips a saved draft', () => {
    saveDraft('function sort(arr) {}')
    expect(loadDraft()).toBe('function sort(arr) {}')
    expect(localStorage.getItem(DRAFT_KEY)).toBe('function sort(arr) {}')
  })

  it('falls back to the default when storage throws', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    expect(loadDraft()).toBe(DEFAULT_SOURCE)
    Storage.prototype.getItem = original
  })
})

describe('DEFAULT_SOURCE', () => {
  it('defines a sort function and mentions the API', () => {
    expect(DEFAULT_SOURCE).toContain('function sort(arr)')
    expect(DEFAULT_SOURCE).toContain('arr.compare')
    expect(DEFAULT_SOURCE).toContain('arr.swap')
  })
})
```

Create `src/components/apiEntries.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { API_ENTRIES } from './apiEntries'
import { TrackedArray } from '../core/trackedArray'

/** The reference panel is the user's only contract. Drift here is a real bug. */
describe('API_ENTRIES', () => {
  it('documents every public method of TrackedArray', () => {
    const actual = Object.getOwnPropertyNames(TrackedArray.prototype).filter(
      (name) => name !== 'constructor' && !name.startsWith('_'),
    )
    const documented = API_ENTRIES.map((e) => e.member)
    for (const name of actual) {
      // Private helpers are not on the prototype's public surface by convention;
      // anything reachable from user code must appear in the reference.
      if (['record', 'bounds', 'mark'].includes(name)) continue
      expect(documented, `missing from the API reference: ${name}`).toContain(name)
    }
  })

  it('documents length and the aux buffer', () => {
    const documented = API_ENTRIES.map((e) => e.member)
    expect(documented).toContain('length')
    expect(documented).toContain('alloc')
  })

  it('gives each entry a signature and a description', () => {
    for (const e of API_ENTRIES) {
      expect(e.signature.length).toBeGreaterThan(0)
      expect(e.description.length).toBeGreaterThan(10)
    }
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/customCode.test.ts src/components/apiEntries.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the draft store and default source**

Create `src/customCode.ts`:

```ts
export const DRAFT_KEY = 'sortviz.draft'

export const DEFAULT_SOURCE = `// Write a function called sort(arr).
// arr is not a plain array — every operation you call is recorded and animated.
//
//   arr.length          number of elements
//   arr.get(i)          read a value
//   arr.set(i, v)       write a value
//   arr.compare(i, j)   -1, 0 or 1
//   arr.swap(i, j)      exchange two elements

function sort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i
    while (j > 0 && arr.compare(j - 1, j) > 0) {
      arr.swap(j - 1, j)
      j--
    }
  }
}
`

export function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? DEFAULT_SOURCE
  } catch {
    // Private browsing, blocked storage — the editor still works, it just forgets.
    return DEFAULT_SOURCE
  }
}

export function saveDraft(source: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, source)
  } catch {
    // Nothing to do; losing the draft is better than breaking the editor.
  }
}
```

- [ ] **Step 5: Implement the API reference**

Create `src/components/apiEntries.ts`:

```ts
export interface ApiEntry {
  member: string
  signature: string
  description: string
}

export const API_ENTRIES: readonly ApiEntry[] = [
  { member: 'length', signature: 'arr.length', description: 'How many elements the array holds.' },
  {
    member: 'get',
    signature: 'arr.get(i) -> number',
    description: 'Reads the value at index i and records a read.',
  },
  {
    member: 'set',
    signature: 'arr.set(i, v)',
    description: 'Writes v at index i and records a write.',
  },
  {
    member: 'compare',
    signature: 'arr.compare(i, j) -> -1 | 0 | 1',
    description: 'Compares two elements. Negative means the element at i is smaller.',
  },
  {
    member: 'compareValue',
    signature: 'arr.compareValue(i, v) -> -1 | 0 | 1',
    description: 'Compares the element at i against a value you are holding outside the array.',
  },
  {
    member: 'swap',
    signature: 'arr.swap(i, j)',
    description: 'Exchanges two elements in one recorded operation.',
  },
  {
    member: 'alloc',
    signature: 'arr.alloc(n) -> aux',
    description:
      'Allocates an auxiliary buffer with its own get, set and compare, drawn beneath the main array. Once per run.',
  },
  {
    member: 'markPivot',
    signature: 'arr.markPivot(i)',
    description: 'Highlights index i as the current pivot.',
  },
  {
    member: 'markSorted',
    signature: 'arr.markSorted(...indices)',
    description: 'Marks indices as finished. They turn green and stay that way.',
  },
  {
    member: 'markRange',
    signature: 'arr.markRange(lo, hi)',
    description: 'Dims everything outside lo..hi to show the range you are working on.',
  },
  {
    member: 'clearMarks',
    signature: 'arr.clearMarks()',
    description: 'Clears the pivot and range marks. Sorted marks are kept.',
  },
  {
    member: 'counts',
    signature: 'arr.counts',
    description: 'Live totals for reads, writes, compares and swaps.',
  },
  {
    member: 'auxLength',
    signature: 'arr.auxLength',
    description: 'Length of the auxiliary buffer, or 0 when none was allocated.',
  },
  {
    member: 'snapshot',
    signature: 'arr.snapshot() -> number[]',
    description: 'A plain copy of the current values. Useful while debugging your own code.',
  },
  {
    member: 'auxSnapshot',
    signature: 'arr.auxSnapshot() -> number[]',
    description: 'A plain copy of the auxiliary buffer.',
  },
]
```

Create `src/components/ApiReference.tsx`:

```tsx
import { API_ENTRIES } from './apiEntries'

export default function ApiReference() {
  return (
    <section className="inspector__block">
      <div className="label">the array API</div>
      <p className="inspector__desc">
        Your function receives an instrumented array. Every call below is recorded and animated.
      </p>
      <dl className="api">
        {API_ENTRIES.map((entry) => (
          <div className="api__row" key={entry.member}>
            <dt className="mono api__sig">{entry.signature}</dt>
            <dd className="api__desc">{entry.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
```

- [ ] **Step 6: Implement the editor wrapper**

Create `src/components/CodeMirrorEditor.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'

interface Props {
  value: string
  onChange: (value: string) => void
}

/**
 * CodeMirror owns its own document. React only seeds it, so typing never
 * round-trips through a re-render.
 */
export default function CodeMirrorEditor({ value, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          javascript(),
          oneDark,
          keymap.of([indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.theme({ '&': { height: '100%', fontSize: '13px' } }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Deliberately mounts once: `value` seeds the document, later edits flow out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace the document only when it is changed from outside (loading a built-in).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div className="editor" ref={hostRef} />
}
```

- [ ] **Step 7: Implement the code panel**

Create `src/components/CodePanel.tsx`:

```tsx
import { ALGORITHMS } from '../algorithms'
import CodeMirrorEditor from './CodeMirrorEditor'

interface Props {
  source: string
  busy: boolean
  onSourceChange: (source: string) => void
  onRun: () => void
}

export default function CodePanel({ source, busy, onSourceChange, onRun }: Props) {
  return (
    <div className="codepanel">
      <div className="codepanel__bar">
        <span className="label">your code</span>
        <select
          aria-label="Start from a built-in"
          value=""
          onChange={(e) => {
            const algo = ALGORITHMS.find((a) => a.meta.id === e.target.value)
            if (algo) onSourceChange(toPlainJs(algo.source))
          }}
        >
          <option value="">start from a built-in…</option>
          {ALGORITHMS.map((a) => (
            <option key={a.meta.id} value={a.meta.id}>
              {a.meta.name}
            </option>
          ))}
        </select>
        <button onClick={onRun} disabled={busy}>
          {busy ? 'running…' : 'run ▶'}
        </button>
      </div>
      <CodeMirrorEditor value={source} onChange={onSourceChange} />
    </div>
  )
}

/** Built-ins are TypeScript. Strip the annotations so the source runs as-is. */
function toPlainJs(source: string): string {
  return source
    .replace(/function sort\(a: TrackedArray\): void/, 'function sort(a)')
    .replace(/: (number|string|boolean)\[\]/g, '')
    .replace(/\(([a-zA-Z]+): number(, )?/g, '($1$2')
    .replace(/([a-zA-Z]+): number\)/g, '$1)')
    .replace(/\): (number|void|boolean|-1 \| 0 \| 1) =>/g, ') =>')
    .replace(/\): (number|void|boolean) \{/g, ') {')
}
```

- [ ] **Step 8: Add the styles**

Append to `src/styles/components.css`:

```css
.mode {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}

.app__stage--split {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(220px, 40%);
}

.codepanel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: var(--hairline);
}

.codepanel__bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--hairline);
}

.codepanel__bar button {
  margin-left: auto;
}

.editor {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.api {
  margin: 0;
}

.api__row {
  padding: var(--space-2) 0;
  border-bottom: var(--hairline);
}

.api__sig {
  font-size: var(--fs-small);
  color: var(--c-accent);
}

.api__desc {
  margin: var(--space-1) 0 0;
  color: var(--c-muted);
  line-height: 1.5;
}
```

- [ ] **Step 9: Wire custom mode into the app**

In `src/App.tsx`:

1. Add imports:

```tsx
import ApiReference from './components/ApiReference'
import CodePanel from './components/CodePanel'
import { loadDraft, saveDraft } from './customCode'
```

2. Add state next to the existing state:

```tsx
const [mode, setMode] = useState<'builtin' | 'custom'>('builtin')
const [source, setSource] = useState(() => loadDraft())
```

3. Persist the draft:

```tsx
useEffect(() => {
  saveDraft(source)
}, [source])
```

4. Add a custom run, alongside `start`:

```tsx
const runCustom = useCallback(async () => {
  const input = generate(settings.size, settings.distribution, settings.seed)
  const result = await run({ kind: 'custom', source, input })
  if (result.ok) {
    setError(null)
    setSorted(result.sorted)
    setTrace(result.trace)
  } else {
    setError(result.error)
    setTrace(null)
  }
}, [run, settings, source])
```

5. Guard the built-in auto-run so it does not fire in custom mode:

```tsx
useEffect(() => {
  if (mode !== 'builtin') return
  void start(algorithmId, settings)
}, [mode, algorithmId, settings, start])
```

6. Add the mode switch to the header:

```tsx
<div className="mode">
  <button aria-pressed={mode === 'builtin'} onClick={() => setMode('builtin')}>
    library
  </button>
  <button aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}>
    your code
  </button>
</div>
```

7. Split the stage and swap the inspector in custom mode:

```tsx
<main className={`app__stage${mode === 'custom' ? ' app__stage--split' : ''}`}>
  <div style={{ position: 'relative', minHeight: 0 }}>
    <Canvas engine={player.engine} style={settings.style} theme={DARK} />
    <ErrorBanner error={error} onDismiss={() => setError(null)} />
  </div>
  {mode === 'custom' && (
    <CodePanel source={source} busy={busy} onSourceChange={setSource} onRun={runCustom} />
  )}
</main>
```

and in the inspector:

```tsx
<aside className="app__inspector">
  {mode === 'custom' ? (
    <>
      <section className="inspector__block">
        <div className="label">result</div>
        <span className={`chip chip--${sorted ? 'ok' : 'bad'}`}>
          {sorted ? 'sorted' : 'not sorted'}
        </span>
        <dl className="grid2" style={{ marginTop: 'var(--space-3)' }}>
          <div className="readout">
            <dt>compares</dt>
            <dd className="num">{(player.engine?.frame.counts.compares ?? 0).toLocaleString()}</dd>
          </div>
          <div className="readout">
            <dt>swaps</dt>
            <dd className="num">{(player.engine?.frame.counts.swaps ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
      </section>
      <ApiReference />
    </>
  ) : (
    <Telemetry
      counts={player.engine?.frame.counts ?? { reads: 0, writes: 0, compares: 0, swaps: 0 }}
      index={player.index}
      total={player.total}
      sorted={sorted}
      algorithm={algorithm}
    />
  )}
</aside>
```

Also hide the algorithm picker in custom mode by wrapping it: `{mode === 'builtin' && <AlgorithmPicker … />}`.

`tsconfig` sets `noUnusedLocals`, so import only what you actually render — do not
import `DEFAULT_SOURCE` here unless you add a reset button that uses it.

- [ ] **Step 10: Run the tests**

Run: `npm test`
Expected: all passed.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Verify custom code in the browser**

Run: `npm run dev`, switch to "your code", and confirm each case:

1. The default insertion sort runs and animates on Run.
2. `function sort(arr) { while (true) {} }` → timeout banner, tab stays responsive.
3. `function sort(arr) { for(;;) arr.get(0) }` → step-budget banner naming an infinite loop.
4. `function sort(arr) { if ( }` → syntax banner.
5. `const x = 1` → not-a-function banner.
6. `function sort(arr) { arr.swap(0, 1) }` → runs, animates, verdict chip reads "not sorted".
7. `function sort(arr) { arr.get(999) }` → runtime banner with the RangeError message.
8. "Start from a built-in" loads heapsort, and it runs unmodified.
9. Reload the page — the edited source is still there.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(custom): visualize user-written JavaScript sorts"
```

---

### Task 18: Race mode

**Files:**
- Create: `src/player/raceEngine.ts`, `src/player/useRace.ts`, `src/components/RaceGrid.tsx`
- Modify: `src/App.tsx` (third mode), `src/styles/components.css`
- Test: `src/player/raceEngine.test.ts`

**Interfaces:**
- Consumes: `PlayerEngine`, `Trace`, `advance`, `Canvas`, `useRunner`, `generate`.
- Produces:
  - `interface Lane { id: string; label: string; engine: PlayerEngine }`
  - `class RaceEngine` — `constructor(lanes: Lane[])`, `lanes`, `index`, `total`, `finished`, `seek(i)`, `stepBy(n)`, `tick(dtMs, speed)`, `onFrame(cb)`
  - `function useRace(traces: Array<{ id: string; label: string; trace: Trace }>)` — same transport surface as `usePlayer`
  - `<RaceGrid race theme style />`

- [ ] **Step 1: Write the failing tests**

Create `src/player/raceEngine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RaceEngine } from './raceEngine'
import { PlayerEngine } from './engine'
import { runSort } from '../core/runner'
import { getAlgorithm } from '../algorithms'
import { generate } from '../core/generate'

const laneFor = (id: string, input: number[]) => {
  const r = runSort(getAlgorithm(id)!.sort, input)
  if (!r.ok) throw new Error('setup failed')
  return { id, label: id, engine: new PlayerEngine(r.trace) }
}

const race = () => {
  const input = generate(32, 'random', 11)
  return new RaceEngine([laneFor('bubble', input), laneFor('heap', input)])
}

describe('RaceEngine', () => {
  it('total is the longest lane', () => {
    const r = race()
    expect(r.total).toBe(Math.max(...r.lanes.map((l) => l.engine.total)))
  })

  it('advances every lane together', () => {
    const r = race()
    r.seek(20)
    expect(r.index).toBe(20)
    for (const lane of r.lanes) expect(lane.engine.index).toBe(Math.min(20, lane.engine.total))
  })

  it('holds a finished lane at its end while others continue', () => {
    const r = race()
    const short = r.lanes.reduce((a, b) => (a.engine.total <= b.engine.total ? a : b))
    r.seek(r.total)
    expect(short.engine.index).toBe(short.engine.total)
    expect(r.finished).toBe(true)
  })

  it('every lane ends sorted', () => {
    const r = race()
    r.seek(r.total)
    for (const lane of r.lanes) {
      const values = Array.from(lane.engine.frame.main)
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
  })

  it('ticking is equivalent to seeking the same distance', () => {
    const a = race()
    const b = race()
    a.tick(1000, 50)
    b.seek(50)
    expect(a.index).toBe(b.index)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/player/raceEngine.test.ts`
Expected: FAIL — cannot find module `./raceEngine`.

- [ ] **Step 3: Implement the race engine**

Create `src/player/raceEngine.ts`:

```ts
import type { PlayerEngine } from './engine'
import { advance } from './timing'

export interface Lane {
  id: string
  label: string
  engine: PlayerEngine
}

/** One shared step index driving several traces over the same input. */
export class RaceEngine {
  private position = 0
  private carry = 0
  private subscribers = new Set<() => void>()

  constructor(readonly lanes: readonly Lane[]) {}

  get index(): number {
    return this.position
  }

  get total(): number {
    return this.lanes.reduce((max, l) => Math.max(max, l.engine.total), 0)
  }

  get finished(): boolean {
    return this.position >= this.total
  }

  seek(index: number): void {
    const target = Math.max(0, Math.min(index, this.total))
    if (target === this.position) return
    this.position = target
    // A lane shorter than the shared index simply holds its final state.
    for (const lane of this.lanes) lane.engine.seek(Math.min(target, lane.engine.total))
    this.carry = 0
    this.emit()
  }

  stepBy(n: number): void {
    this.seek(this.position + n)
  }

  tick(dtMs: number, stepsPerSecond: number): void {
    const { steps, carry } = advance(dtMs, stepsPerSecond, this.carry, this.total - this.position)
    this.carry = carry
    if (steps <= 0) return
    this.seek(this.position + steps)
    this.carry = carry
  }

  onFrame(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private emit(): void {
    for (const cb of this.subscribers) cb()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/player/raceEngine.test.ts`
Expected: all passed.

- [ ] **Step 5: Implement the race hook**

Create `src/player/useRace.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trace } from '../core/runner'
import { PlayerEngine } from './engine'
import { RaceEngine } from './raceEngine'
import { SPEEDS } from './timing'

export interface RaceInput {
  id: string
  label: string
  trace: Trace
}

export function useRace(inputs: readonly RaceInput[]) {
  const race = useMemo(
    () =>
      inputs.length > 0
        ? new RaceEngine(
            inputs.map((i) => ({ id: i.id, label: i.label, engine: new PlayerEngine(i.trace) })),
          )
        : null,
    [inputs],
  )

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[6])
  const [index, setIndex] = useState(0)
  const lastUi = useRef(0)

  useEffect(() => {
    setIndex(0)
    setPlaying(false)
  }, [race])

  useEffect(() => {
    if (!race || !playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      race.tick(now - last, speed)
      last = now
      if (now - lastUi.current > 60) {
        lastUi.current = now
        setIndex(race.index)
      }
      if (race.finished) {
        setPlaying(false)
        setIndex(race.index)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [race, playing, speed])

  const act = useCallback(
    (fn: (r: RaceEngine) => void) => {
      if (!race) return
      fn(race)
      setIndex(race.index)
    },
    [race],
  )

  return {
    race,
    index,
    total: race?.total ?? 0,
    playing,
    speed,
    setSpeed,
    toggle: () => setPlaying((p) => !p),
    seek: (i: number) => act((r) => r.seek(i)),
    stepForward: () => act((r) => r.stepBy(1)),
    stepBack: () => act((r) => r.stepBy(-1)),
  }
}
```

- [ ] **Step 6: Implement the race grid**

Create `src/components/RaceGrid.tsx`:

```tsx
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
        if (canvas.width !== Math.round(width * dpr)) {
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
              }}
            />
          </div>
          <div className="race__plot">
            <canvas
              style={{ display: 'block' }}
              ref={(el) => {
                if (el) canvasRefs.current.set(lane.id, el)
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
```

Append to `src/styles/components.css`:

```css
.race {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  height: 100%;
  grid-template-columns: 1fr 1fr;
}

.race[data-lanes='2'] {
  grid-template-rows: 1fr;
}

.race[data-lanes='3'],
.race[data-lanes='4'] {
  grid-template-rows: 1fr 1fr;
}

.race__lane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.race__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--hairline);
}

.race__name {
  font-family: var(--font-mono);
  font-size: var(--fs-small);
}

.race__stats {
  font-size: var(--fs-micro);
  color: var(--c-muted);
}

.race__plot {
  min-height: 0;
}

@media (max-width: 900px) {
  .race {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Add race mode to the app**

In `src/App.tsx`:

1. Widen the mode union to `'builtin' | 'custom' | 'race'` and add a third header button labelled `race`.
2. Add state and a runner:

```tsx
const [raceIds, setRaceIds] = useState<string[]>(['bubble', 'quick-lomuto'])
const [raceInputs, setRaceInputs] = useState<RaceInput[]>([])

const startRace = useCallback(async () => {
  const input = generate(settings.size, settings.distribution, settings.seed)
  const results = await Promise.all(
    raceIds.map((id) => run({ kind: 'builtin', algorithmId: id, input })),
  )
  const lanes: RaceInput[] = []
  results.forEach((result, i) => {
    if (result.ok) {
      lanes.push({ id: raceIds[i], label: getAlgorithm(raceIds[i])!.meta.name, trace: result.trace })
    } else {
      setError(result.error)
    }
  })
  setRaceInputs(lanes)
}, [raceIds, run, settings])

useEffect(() => {
  if (mode !== 'race') return
  void startRace()
}, [mode, startRace])

const raceState = useRace(raceInputs)
```

3. In race mode render `<RaceGrid race={raceState.race} … />` in the stage (when `raceState.race` is non-null), drive `<Controls>` from `raceState` instead of `player`, and put a lane selector in the rail: reuse `AlgorithmPicker` with a multi-select variant, or the simpler version below.

```tsx
<div className="config">
  <div className="label">race lanes (2–4)</div>
  {raceIds.map((id, slot) => (
    <select
      key={slot}
      value={id}
      aria-label={`Lane ${slot + 1}`}
      onChange={(e) =>
        setRaceIds((ids) => ids.map((v, k) => (k === slot ? e.target.value : v)))
      }
    >
      {ALGORITHMS.map((a) => (
        <option key={a.meta.id} value={a.meta.id}>
          {a.meta.name}
        </option>
      ))}
    </select>
  ))}
  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
    <button
      disabled={raceIds.length >= 4}
      onClick={() => setRaceIds((ids) => [...ids, 'merge-top-down'])}
    >
      add lane
    </button>
    <button disabled={raceIds.length <= 2} onClick={() => setRaceIds((ids) => ids.slice(0, -1))}>
      remove lane
    </button>
  </div>
</div>
```

Import `ALGORITHMS`, `RaceGrid`, `useRace` and `type RaceInput` at the top of the file.

- [ ] **Step 8: Verify**

Run: `npm test` — all passed.
Run: `npm run dev` and confirm:

1. Two lanes appear side by side over the same input.
2. Play advances both; the O(n²) lane is visibly still working when the O(n log n) lane finishes.
3. A finished lane shows "finished at N" and holds its sorted state.
4. Adding a third and fourth lane re-lays the grid without overflow.
5. Scrubbing backwards keeps all lanes in sync.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(race): add synchronized multi-algorithm race mode"
```

---

### Task 19: Audio sonification

**Files:**
- Create: `src/audio/pitch.ts`, `src/audio/sonifier.ts`, `src/components/AudioToggle.tsx`
- Modify: `src/App.tsx` (subscribes to engine frames and plays the notes)
- Test: `src/audio/pitch.test.ts`

**Interfaces:**
- Consumes: `FrameState`, `Theme`.
- Produces:
  - `function pitchFor(value: number, max: number): number` — Hz
  - `const MIN_HZ = 160`, `const MAX_HZ = 640`, `const MAX_VOICES = 6`, `const NOTE_MS = 55`
  - `class Sonifier` — `constructor(ctx?)`, `enabled`, `setEnabled(on)`, `setVolume(v)`, `note(value, max)`, `dispose()`
  - `<AudioToggle enabled volume onToggle onVolume />`

- [ ] **Step 1: Write the failing tests**

Create `src/audio/pitch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MAX_HZ, MIN_HZ, pitchFor } from './pitch'

describe('pitchFor', () => {
  it('maps the value range onto the audible band', () => {
    expect(pitchFor(0, 100)).toBeCloseTo(MIN_HZ, 5)
    expect(pitchFor(100, 100)).toBeCloseTo(MAX_HZ, 5)
  })

  it('rises monotonically with value', () => {
    expect(pitchFor(50, 100)).toBeGreaterThan(pitchFor(20, 100))
  })

  it('spans roughly two octaves', () => {
    expect(MAX_HZ / MIN_HZ).toBeGreaterThan(3.5)
    expect(MAX_HZ / MIN_HZ).toBeLessThan(4.5)
  })

  it('clamps out-of-range values instead of going inaudible', () => {
    expect(pitchFor(-10, 100)).toBe(MIN_HZ)
    expect(pitchFor(999, 100)).toBe(MAX_HZ)
  })

  it('survives a zero maximum', () => {
    expect(pitchFor(0, 0)).toBe(MIN_HZ)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/audio/pitch.test.ts`
Expected: FAIL — cannot find module `./pitch`.

- [ ] **Step 3: Implement the pitch mapping**

Create `src/audio/pitch.ts`:

```ts
export const MIN_HZ = 160
export const MAX_HZ = 640
/** Simultaneous voices. More than this during fast playback is just noise. */
export const MAX_VOICES = 6
export const NOTE_MS = 55

/** Linear in value, which reads as a rising sweep when the array sorts. */
export function pitchFor(value: number, max: number): number {
  if (!(max > 0)) return MIN_HZ
  const t = Math.max(0, Math.min(1, value / max))
  return MIN_HZ + t * (MAX_HZ - MIN_HZ)
}
```

- [ ] **Step 4: Implement the sonifier**

No unit test — it needs a real `AudioContext`. It is verified by hand in Step 7.

Create `src/audio/sonifier.ts`:

```ts
import { MAX_VOICES, NOTE_MS, pitchFor } from './pitch'

/**
 * Plays one short tone per event, pitched by value. Voices are pooled and
 * capped so that fast playback does not turn into a click storm.
 */
export class Sonifier {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private active = 0
  private volume = 0.25
  private on = false

  get enabled(): boolean {
    return this.on
  }

  setEnabled(on: boolean): void {
    this.on = on
    if (on) this.ensure()
    else this.master?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.01)
    if (on && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01)
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.on && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01)
    }
  }

  note(value: number, max: number): void {
    if (!this.on) return
    const ctx = this.ensure()
    if (!ctx || this.active >= MAX_VOICES) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = pitchFor(value, max)

    const seconds = NOTE_MS / 1000
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds)

    osc.connect(gain).connect(this.master!)
    this.active++
    osc.onended = () => {
      this.active--
      gain.disconnect()
    }
    osc.start(now)
    osc.stop(now + seconds)
  }

  dispose(): void {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      // Browsers suspend the context until a user gesture; a click on the toggle counts.
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    if (typeof AudioContext === 'undefined') return null
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)
    return this.ctx
  }
}
```

- [ ] **Step 5: Implement the toggle**

Create `src/components/AudioToggle.tsx`:

```tsx
interface Props {
  enabled: boolean
  volume: number
  onToggle: () => void
  onVolume: (v: number) => void
}

export default function AudioToggle({ enabled, volume, onToggle, onVolume }: Props) {
  return (
    <div className="audio">
      <button aria-pressed={enabled} onClick={onToggle} aria-label="Toggle sound">
        {enabled ? '🔊 sound' : '🔈 muted'}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        disabled={!enabled}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
        aria-label="Volume"
      />
    </div>
  )
}
```

- [ ] **Step 6: Emit notes during playback**

In `src/App.tsx`:

```tsx
import { useMemo } from 'react'
import { Sonifier } from './audio/sonifier'
import AudioToggle from './components/AudioToggle'

const sonifier = useMemo(() => new Sonifier(), [])
const [audioOn, setAudioOn] = useState(false)
const [volume, setVolume] = useState(0.25)

useEffect(() => () => sonifier.dispose(), [sonifier])

// Sound follows the frame, so it works for playback and for single stepping alike.
useEffect(() => {
  const engine = player.engine
  if (!engine || !audioOn) return
  let max = 1
  for (const v of engine.frame.main) if (v > max) max = v
  return engine.onFrame((frame) => {
    const i = frame.lastWrite.findIndex((t) => t === frame.index - 1)
    const j = i >= 0 ? i : frame.lastCompare.findIndex((t) => t === frame.index - 1)
    if (j >= 0) sonifier.note(frame.main[j], max)
  })
}, [player.engine, audioOn, sonifier])

useEffect(() => {
  sonifier.setEnabled(audioOn)
}, [audioOn, sonifier])

useEffect(() => {
  sonifier.setVolume(volume)
}, [volume, sonifier])
```

Add `<AudioToggle enabled={audioOn} volume={volume} onToggle={() => setAudioOn((v) => !v)} onVolume={setVolume} />` to the header, before the mode switch.

Append to `src/styles/components.css`:

```css
.audio {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.audio input[type='range'] {
  width: 80px;
}
```

- [ ] **Step 7: Verify by hand**

Run: `npm run dev`.

1. Audio is off on load and stays silent.
2. Enabling it and pressing play produces rising tones as the array orders.
3. At 5000 steps/second the sound stays a texture — no clipping, no click storm.
4. Muting silences it immediately.
5. `npm test` still passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(audio): add optional sonification"
```

---

### Task 20: Keyboard control, polish, and final verification

**Files:**
- Create: `src/useKeyboard.ts`, `README.md`
- Modify: `src/App.tsx`, `src/styles/global.css`
- Test: `src/useKeyboard.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `function useKeyboard(handlers: KeyHandlers): void`, `interface KeyHandlers { onToggle(): void; onStep(delta: number): void; onStart(): void; onEnd(): void }`

- [ ] **Step 1: Write the failing test**

Create `src/useKeyboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboard } from './useKeyboard'

const press = (key: string, target?: Element) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  ;(target ?? document.body).dispatchEvent(event)
  return event
}

const handlers = () => ({
  onToggle: vi.fn(),
  onStep: vi.fn(),
  onStart: vi.fn(),
  onEnd: vi.fn(),
})

describe('useKeyboard', () => {
  it('maps space to play/pause and arrows to stepping', () => {
    const h = handlers()
    renderHook(() => useKeyboard(h))
    press(' ')
    press('ArrowRight')
    press('ArrowLeft')
    press('Home')
    press('End')
    expect(h.onToggle).toHaveBeenCalledOnce()
    expect(h.onStep).toHaveBeenNthCalledWith(1, 1)
    expect(h.onStep).toHaveBeenNthCalledWith(2, -1)
    expect(h.onStart).toHaveBeenCalledOnce()
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('ignores keys while the user is typing', () => {
    const h = handlers()
    renderHook(() => useKeyboard(h))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press(' ', input)
    expect(h.onToggle).not.toHaveBeenCalled()
    input.remove()
  })

  it('prevents the page from scrolling on space', () => {
    renderHook(() => useKeyboard(handlers()))
    expect(press(' ').defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/useKeyboard.test.tsx`
Expected: FAIL — cannot find module `./useKeyboard`.

- [ ] **Step 3: Implement keyboard handling**

Create `src/useKeyboard.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/useKeyboard.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Wire it into the app**

In `src/App.tsx`, wire the active transport (the player in library/custom mode, the race in race mode):

```tsx
import { useKeyboard } from './useKeyboard'

const transport = mode === 'race' ? raceState : player
useKeyboard({
  onToggle: transport.toggle,
  onStep: (d) => (d > 0 ? transport.stepForward() : transport.stepBack()),
  onStart: () => transport.seek(0),
  onEnd: () => transport.seek(transport.total),
})
```

Add a shortcut hint to the header:

```tsx
<span className="label" style={{ marginLeft: 'var(--space-4)' }}>
  space play · ← → step · home/end jump
</span>
```

- [ ] **Step 6: Write the README**

Create `README.md`:

```markdown
# Sorting Visualizer

A sorting algorithm visualizer that also runs your own JavaScript.

## Running it

```bash
npm install
npm run dev
```

## What it does

- 31 sorting algorithms across seven families, each with complexity, stability and a live code view.
- Four render styles: bars, dots, rainbow, pyramid.
- Full transport: play, pause, single step in both directions, scrub, jump. Backward
  scrubbing is exact — the app never re-runs the algorithm.
- Race mode: 2–4 algorithms over identical input, one shared clock.
- Optional sonification.

## Writing your own sort

Switch to "your code" and write a function called `sort`. It receives an
instrumented array — every operation you call is recorded and animated:

```js
function sort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i
    while (j > 0 && arr.compare(j - 1, j) > 0) {
      arr.swap(j - 1, j)
      j--
    }
  }
}
```

The full API is listed beside the editor. Your code runs in a Web Worker under a
step budget and a time limit, so an infinite loop produces an error message
rather than a frozen tab.

## Architecture

`input → runner → Step[] → player index → frame state → renderer`, one direction only.

- `src/core/` — the `Step` model, the instrumented array, the runner, keyframe seeking. No DOM.
- `src/algorithms/` — one file per algorithm, written against the same API users write against.
- `src/worker/` — the only place a sort executes.
- `src/player/` — playback engine and timing.
- `src/render/` — pure layout math plus the four canvas renderers.

## Tests

```bash
npm test
npm run typecheck
```

The conformance harness in `src/algorithms/conformance.test.ts` proves every
registered algorithm against eight fixtures and five generated distributions,
and checks that each trace replays to the same array the algorithm produced.
```

- [ ] **Step 7: Responsive and cross-check pass**

Run `npm run dev` and check at 1440px, 1100px and 820px widths:

1. No horizontal page scroll at any width.
2. The inspector drops below the stage under 1100px and stays readable.
3. The race grid becomes a single column under 900px.
4. Counters do not shift the layout as they climb into the millions.
5. Long algorithm names do not break the picker rows.

Fix anything that fails before continuing.

- [ ] **Step 8: Full verification**

Run each and confirm the output before claiming completion:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests pass (including `src/algorithms/coverage.test.ts`), no type errors, a clean production build.

Then `npm run preview` and walk the acceptance list one final time:

1. Every family in the picker runs and completes with a green "sorted" chip.
2. Merge, timsort, counting, radix LSD and pigeonhole all show the aux lane.
3. Custom code: the six error cases from Task 17 Step 11 each produce the right banner.
4. Race mode with four lanes plays and scrubs in sync.
5. Audio on and off.
6. Keyboard transport works and does not fire while typing in the editor.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add keyboard transport, README, and final polish"
```

---

## Plan Self-Review

Checked against `docs/superpowers/specs/2026-09-10-sorting-visualizer-design.md`:

- **Spec §2 stack** — Task 1 (Vite/React/TS/Vitest), Task 17 (CodeMirror), Task 14 (Canvas), Task 11 (Worker).
- **Spec §3 architecture** — `core/` Tasks 2–5, `algorithms/` Tasks 6–10, `worker/` Task 11, `player/` Task 12, `render/` Tasks 14 and 16.
- **Spec §4 instrumented array** — Task 2, with the `lane` refinement recorded under Spec Reconciliations. Limits in Task 2, seeking in Task 4.
- **Spec §5 coverage** — Tasks 6–10 register 31 algorithms; the conformance harness asserts at least 28.
- **Spec §6 custom code** — Task 17, including the built-in loader, the localStorage draft, and every `RunError` variant. The `incorrect` case is reported on a successful result (Reconciliation 2) and surfaces through the verdict chip.
- **Spec §7 race mode** — Task 18, including per-panel counters and the "finished at N" hold.
- **Spec §8 controls** — Task 15 (transport, scrubber, speed, size, distribution, seed, style), Task 16 (all four styles), Task 19 (audio), Task 20 (keyboard).
- **Spec §9 visual design** — Task 13 tokens and theme, Task 14 flat bars with a hairline top edge and the decay window, Task 15 tabular-numeric telemetry.
- **Spec §10 testing** — correctness, trace integrity, seeking, limits, worker contract and counters are all covered by named tests in Tasks 2–12.
- **Spec §11 out of scope** — nothing in the plan adds HTML/CSS editing, a snippet library, URL sharing, a server, or a light theme.

Type consistency verified across tasks: `Step`/`Lane`/`Counts` (Task 2) flow unchanged into `FrameState` (Task 4), `Trace`/`Keyframe`/`RunResult`/`RunError` (Task 3) into the worker protocol (Task 11) and the player (Task 12), `Renderer`/`Size`/`PlotArea` (Task 14) into every render style (Task 16) and both canvas hosts (Tasks 14 and 18), and `AuxArray.compare` (Task 2) into all three merge implementations (Task 8).
