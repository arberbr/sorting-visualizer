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
