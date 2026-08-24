import { describe, expect, it } from 'vitest'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  // TanStack Query's default is 3 retries with exponential backoff — tuned
  // for flaky networks. Every query here is a local SQLite IPC call, where a
  // failure is deterministic: retrying only delays the error state by
  // seconds. Failures must surface immediately.
  it('disables retries for queries and mutations', () => {
    const defaults = createQueryClient().getDefaultOptions()

    expect(defaults.queries?.retry).toBe(false)
    expect(defaults.mutations?.retry).toBe(false)
  })
})
