// The renderer's provider stack, and nothing else. Which screen is on screen
// is the router's job (`router.tsx`), and the chrome around it is the Shell's
// (`Shell.tsx`) — this file only decides what wraps them.
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { createAppRouter } from './router'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { createQueryClient } from './shared/lib/queryClient'

const queryClient = createQueryClient()

// The boundary sits OUTSIDE both providers: a crash in the query plumbing or
// in the router itself is exactly the failure it must survive. Nothing needs
// to sit above it — i18next is a synchronous singleton (see i18n/index.ts),
// not a provider, so the fallback can translate from the very top of the tree.
export function App() {
  // Created once per mount rather than at module scope: a module-level router
  // is a singleton that would carry its location across mounts.
  const [router] = useState(createAppRouter)

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
