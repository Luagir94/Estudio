// Intentionally benign fixture — proves the `listener-only-in-mcp-slice` rule
// exempts type-only `node:net` imports outside the listener. Type imports
// are erased at compile time and carry no runtime footprint. It exists only
// so `tooling/dependencyGuard.test.ts` has a compliant module to clear.
import type { Server } from 'node:net'

export type ServerHandle = { server: Server | null }
