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
