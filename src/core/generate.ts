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
/**
 * The ceiling for race mode specifically. Every lane keeps its own complete
 * Step trace on the main thread, so a 4-lane race costs four of them at once
 * — measured at roughly 100-180 MB per trace at n=1000, i.e. around half a
 * gigabyte retained. The spec's planned mitigation (posting traces back as
 * transferable typed arrays) was never built, and race mode's pedagogical
 * value — watching algorithms diverge under one clock — is fully served at
 * this size. Single-run mode is unaffected and still goes to MAX_N.
 */
export const RACE_MAX_N = 400
/**
 * Above this, a trace takes noticeably longer to compute and bars fall below
 * a pixel — a legibility and latency threshold, not a budget one. (It is not
 * where O(n^2) algorithms hit the step cap: they don't, at any size this app
 * allows.)
 */
export const LARGE_N_WARNING = 400

/** mulberry32 — small, fast, and good enough for shuffling bars. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1
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
      const out = ascending.slice()
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
      const out = ascending.slice()
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
