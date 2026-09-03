// Intentionally invalid fixture — proves the dependency guard's
// `listener-only-in-mcp-slice` rule (mcp-app-control PR10) actually fails the
// build when a file outside `pipeListener.ts`/`pipeListener.test.ts`/the
// future `mcp-shim/index.ts` imports `node:net`. Never import this file from
// production code; it exists only so `tooling/dependencyGuard.test.ts` has
// something to catch.
import { createServer } from 'node:net'

export function listenForbidden(): void {
  createServer().listen(0)
}
