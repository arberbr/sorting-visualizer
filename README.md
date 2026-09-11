# Sorting Visualizer

A sorting algorithm visualizer that also runs your own JavaScript.

## Running it

```bash
npm install
npm run dev
```

## What it does

- 31 sorting algorithms across seven families, each with its complexity, stability and
  in-place characteristics in the inspector. Any of their implementations can be loaded
  into the editor with "start from a built-in" in "your code".
- Four render styles: bars, dots, rainbow, pyramid.
- Full transport: play, pause, single step in both directions, scrub, jump. Backward
  scrubbing is exact — the app never re-runs the algorithm.
- Keyboard transport: space to play/pause, ← → to step, Home/End to jump to the
  start or end. Disabled while typing in the code editor or any form control.
- Race mode: 2–4 algorithms over identical input, one shared clock.
- Optional sonification, wired to single-run playback only — see below.

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

## Known limitation: race lanes come from the built-in registry only

The 2-4 lanes of a race are chosen from the 31 registered algorithms. Custom
code cannot be entered into a race — "your code" runs on its own single-run
transport instead. Race mode also caps the array at 400 elements however large
the slider is set in the other modes: every lane keeps its own full trace of
every operation it performed, so four lanes cost four traces at once.

## Known limitation: audio only follows single-run playback

Sonification is wired to the single-run transport (library and custom-code
modes) only. Race mode stays silent by design: up to four lanes can advance
independently, and mapping all of them to sound at once would routinely blow
past the sonifier's voice cap and turn into noise rather than a signal. If
you turn audio on and switch to race mode, playback just doesn't make sound —
that's expected, not a bug.

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
registered algorithm against nine fixtures and five generated distributions,
and checks that each trace replays to the same array the algorithm produced.
