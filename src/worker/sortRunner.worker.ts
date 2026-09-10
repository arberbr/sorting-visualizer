import { execute } from './execute'
import type { RunRequest, RunResponse } from './protocol'

// Deliberately trivial: all the logic lives in execute(), which is unit-tested.
self.addEventListener('message', (event: MessageEvent<RunRequest>) => {
  const req = event.data
  const response: RunResponse = { id: req.id, result: execute(req) }
  ;(self as unknown as Worker).postMessage(response)
})
