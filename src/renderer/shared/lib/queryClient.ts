// Extracted from App.tsx so the retry policy is a testable seam instead of
// an anonymous `new QueryClient()` closed over by the component tree.
//
// `retry: false` on BOTH queries and mutations: TanStack Query's default of
// 3 retries with exponential backoff is tuned for flaky networks, but every
// call here is a local SQLite IPC round-trip — failures are deterministic,
// and retrying only delays the error state by seconds. Local-first apps
// fail fast.
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
}
