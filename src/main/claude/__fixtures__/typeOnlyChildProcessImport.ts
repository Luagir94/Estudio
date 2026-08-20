// Intentionally benign fixture — proves the dependency guard exempts
// type-only `child_process` imports outside `claudeExecutableValidator.ts`.
// Type imports are erased at compile time and carry no runtime footprint,
// which is why service modules may reference `ChildProcess` for their spawn
// doubles. It exists only so `tooling/dependencyGuard.test.ts` has a
// compliant module to clear.
import type { ChildProcess } from 'node:child_process'

export type ProcessHandle = { child: ChildProcess | null }
