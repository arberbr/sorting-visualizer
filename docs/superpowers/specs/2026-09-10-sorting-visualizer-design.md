# Sorting Algorithm Visualizer — Design

Date: 2026-09-10
Status: Approved

## 1. Purpose

A browser application that visualizes sorting algorithms as they run, and that
can visualize **the user's own JavaScript** with the same fidelity as the
built-in algorithms.

The user does not paste a web page. They write a single JavaScript function that
sorts an array. The app runs it, records what it did, and animates it.

Success criteria:

1. Every built-in algorithm animates correctly and is verifiably correct.
2. A user pastes a sorting function and sees it animate without further setup.
3. Broken user code produces a clear, actionable error — never a frozen tab and
   never a silent failure.
4. The interface reads as a deliberate technical instrument, not a template.

## 2. Stack

- Vite, React, TypeScript.
- Canvas 2D for the visualization surface. No DOM node per array element.
- CodeMirror 6 for the code editor.
- Web Worker for user code execution.
- Vitest for unit tests.
- No UI component library. No CSS framework. Hand-written CSS with design tokens.

## 3. Architecture

Five units, each independently understandable and testable. Data flows one way:

```
input array -> runner -> Step[] -> player index -> frame state -> renderer
```

### 3.1 `src/core/`

No DOM. No React. No imports from any other unit.

- `types.ts` — `Step`, `Trace`, `RunResult`, `RunError`.
- `trackedArray.ts` — the `TrackedArray` class (section 4).
- `runner.ts` — `runSort(sortFn, input, limits) => RunResult`, the single
  execution entry point for built-in and user-supplied functions alike.
- `keyframes.ts` — snapshot construction and `stateAt(trace, index)` seeking.
- `verify.ts` — checks a final array against `[...input].sort((a,b) => a-b)`.

### 3.2 `src/algorithms/`

One file per algorithm. Each exports:

```ts
export const meta: AlgorithmMeta = {
  id: 'quick-lomuto',
  name: 'Quicksort (Lomuto)',
  family: 'divide-and-conquer',
  best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n^2)',
  space: 'O(log n)',
  stable: false,
  inPlace: true,
  description: '...',
}
export function sort(a: TrackedArray): void
```

`index.ts` aggregates them into a registry grouped by family. Each algorithm's
own source text is imported raw (Vite `?raw`) for display in the code panel and
for "load as starting point" in the editor. **The built-ins are written against
the exact same `TrackedArray` API the user writes against** — they are worked
examples, not a privileged internal path.

### 3.3 `src/worker/`

`sortRunner.worker.ts`. **Every** run goes through the Worker — built-in and
custom alike — so there is exactly one execution path and the main thread can
never block on a sort.

```ts
type RunRequest =
  | { kind: 'builtin'; id: string; input: number[]; limits: Limits }
  | { kind: 'custom'; source: string; input: number[]; limits: Limits }
```

For `builtin`, the Worker resolves the function from the algorithm registry it
imports directly. For `custom`, it constructs the function from source. Both
then call the same `runSort`. It posts back either
`{ ok: true, trace, finalArray, sorted }` or a structured `RunError`. No DOM
access is available inside a Worker, which is the point.

Traces are posted back as transferable typed arrays where the step encoding
allows, to keep the structured-clone cost off the critical path for large runs.

### 3.4 `src/player/`

`usePlayer(trace)` owns `index`, `playing`, `speed`, `direction`. Advances with
`requestAnimationFrame` and a time accumulator so that `speed` means
**steps per second**, independent of display refresh rate. When more than one
step falls in a frame, intermediate steps are applied to state but only the last
is drawn. The player knows nothing about how anything looks.

### 3.5 `src/render/`

```ts
type Renderer = (
  ctx: CanvasRenderingContext2D,
  frame: FrameState,
  theme: Theme,
) => void
```

Four implementations behind that one interface: `bars`, `dots`, `rainbow`,
`pyramid`. Canvas is sized to `devicePixelRatio` and re-measured with a
`ResizeObserver`. React re-renders never drive the animation loop; the loop
writes to the canvas directly.

## 4. The instrumented array

```ts
type Step =
  | { t: 'read';    i: number }
  | { t: 'compare'; i: number; j: number; result: number }
  | { t: 'swap';    i: number; j: number }
  | { t: 'write';   i: number; value: number }
  | { t: 'mark';    kind: 'pivot' | 'sorted' | 'range' | 'aux'; indices: number[] }
```

`TrackedArray` public API — this is the contract shown to the user:

| Member | Meaning |
| --- | --- |
| `length` | element count |
| `get(i)` | read a value, records `read` |
| `set(i, v)` | write a value, records `write` |
| `compare(i, j)` | returns negative / zero / positive, records `compare` |
| `compareValue(i, v)` | compare element `i` against a loose value |
| `swap(i, j)` | exchange two elements, records `swap` |
| `alloc(n)` | allocate an auxiliary buffer (see below) |
| `markPivot(i)` / `markSorted(...i)` / `markRange(lo, hi)` | optional annotation |

Auxiliary buffers exist because merge sort, counting sort, radix sort and bucket
sort are not in-place. `alloc(n)` returns a second tracked strip rendered beneath
the main array, with its own `get` / `set`. Aux operations are recorded with the
`aux` mark kind so the renderer can tint them.

Counters (reads, writes, comparisons, swaps) are derived from the trace, not
tracked separately — one source of truth.

### 4.1 Limits

`runSort` takes `{ maxSteps: 2_000_000, maxMillis: 5_000 }`. Exceeding either
aborts by throwing a sentinel the runner catches and converts into a structured
error. Bogo sort and stooge sort carry their own tighter per-algorithm caps.

### 4.2 Seeking

Full array snapshots are stored every 2000 steps. `stateAt(trace, index)` finds
the nearest preceding keyframe and replays forward. Both work per seek and total
memory are bounded, and scrubbing backwards costs the same as scrubbing forwards.

## 5. Algorithm coverage

**Exchange:** bubble, cocktail shaker, odd-even, gnome, comb, pancake.

**Insertion:** insertion, binary insertion, shell, cycle.

**Selection:** selection, double selection, heap.

**Divide and conquer:** merge (top-down), merge (bottom-up), quicksort (Lomuto),
quicksort (Hoare), quicksort (3-way), quicksort (median-of-three), introsort,
timsort.

**Non-comparison:** counting, radix LSD, radix MSD, bucket, pigeonhole.

**Network / other:** bitonic, tree sort, strand sort.

**Teaching curiosities:** bogo, stooge — both hard-capped and labelled as such.

Approximately 28 algorithms, grouped by family in the picker with complexity and
stability badges.

## 6. Custom code

The editor panel presents a function skeleton:

```js
function sort(arr) {
  // arr.length, arr.get(i), arr.set(i, v)
  // arr.compare(i, j), arr.swap(i, j)
}
```

- API reference sits beside the editor, always visible.
- "Start from a built-in" dropdown loads any built-in's source into the editor.
- **Run** posts the source to the Worker and renders the resulting trace exactly
  as a built-in trace is rendered. Custom runs use the same player, renderers,
  counters and race mode.
- The editor buffer survives reload via `localStorage` (single buffer only; no
  snippet library and no URL sharing — explicitly out of scope).

### 6.1 Error handling

`RunError` is a discriminated union, each rendered as an inline banner with the
user's line number where recoverable:

- `syntax` — the source failed to compile.
- `runtime` — the code threw (message plus line).
- `timeout` — exceeded the wall-clock deadline.
- `step-budget` — exceeded `maxSteps`; almost always an infinite loop.
- `not-a-function` — the source did not define `sort`.
- `incorrect` — it ran and terminated, but the array is not sorted. This is not
  a hard failure: the trace still plays, with a failing correctness chip and the
  first offending index highlighted. Watching your own broken sort fail is a
  feature.

A pass/fail correctness chip is shown for every run, custom or built-in.

## 7. Race mode

Two to four panels in a responsive grid. One input array is generated and each
selected algorithm gets its own trace over that identical input. A single shared
player index drives all panels. A panel whose trace is exhausted holds its final
sorted state and displays "finished at step N". Per-panel counters remain
visible so the cost difference is legible, not just the speed difference.

Custom algorithms can be entered into a race alongside built-ins.

## 8. Controls and inputs

- Play / pause, step forward, step backward, jump to start, jump to end.
- Timeline scrubber over the whole trace, with the step index and total.
- Speed: steps per second, logarithmic slider, plus a "max" mode that renders
  every frame as fast as the display allows.
- Array size: 8 to 1000 (sizes above 400 warn that O(n^2) algorithms will hit
  the step cap).
- Distributions: random, nearly sorted, reversed, few unique, sawtooth, gaussian,
  all equal, single outlier.
- Regenerate with a fixed visible seed so a run can be reproduced exactly.
- Render style switcher: bars, dots, rainbow, pyramid.
- Audio toggle, master volume, off by default.

## 9. Visual design

Dark technical instrument. The screen should read like an oscilloscope or a
profiler, not a dashboard template.

**Ground and structure.** Near-black `#0a0b0f` canvas ground, panel surfaces one
step lighter, a single hairline border token at low opacity. No shadows, no
gradients on chrome, no rounded-corner softness beyond 4px. Panels are separated
by hairlines, not by floating cards.

**Type.** JetBrains Mono for every numeric readout, label and code surface. Inter
for prose and headings. Telemetry sits in fixed-width slots so climbing counters
do not cause layout jitter.

**Color is semantic, never decorative.**

| Role | Color |
| --- | --- |
| idle element | slate |
| being compared | amber |
| being swapped / written | rose |
| pivot | violet |
| confirmed sorted | emerald |
| auxiliary buffer | cyan |

Bars are flat fills with a single-pixel top highlight. Highlight states are
applied for a short decay window (a few steps) so fast playback still shows
activity rather than a blur.

**Audio.** One `OscillatorNode` per event through a shared gain envelope with a
short attack/decay, pitch mapped from element value across roughly two octaves.
Voices are pooled and capped so fast playback does not produce a click storm.
Off by default; muted when the tab is hidden.

## 10. Testing

Vitest, unit level, no browser harness.

- **Correctness:** every registered algorithm sorts correctly across empty,
  single element, two elements, already sorted, reversed, all equal,
  duplicate-heavy, and random inputs at several sizes.
- **Trace integrity:** replaying a trace from the initial array produces exactly
  the algorithm's final array, for every algorithm and every fixture.
- **Seeking:** `stateAt(trace, i)` equals a linear replay to `i`, at random
  indices, for both directions of travel.
- **Limits:** an infinite loop hits `step-budget`; a slow loop hits `timeout`.
- **Worker contract:** the runner's message protocol is tested directly against
  the runner module, including each `RunError` variant.
- **Counters:** derived counts match hand-computed counts on small fixtures.

## 11. Explicitly out of scope

- HTML/CSS editing. The editor accepts JavaScript only.
- Saved snippet libraries and URL-encoded sharing.
- Server, accounts, persistence beyond the single localStorage editor buffer.
- Light theme.
- Mobile-first layout. The app is responsive down to tablet width; a phone gets
  a usable but reduced layout.
