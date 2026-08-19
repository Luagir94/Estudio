// Intentionally invalid fixture — proves the dependency guard (task 2.3/2.5)
// actually fails the build when a file outside `claudeExecutableValidator.ts`
// imports `child_process`. Never import this file from production code; it
// exists only so `tooling/dependencyGuard.test.ts` has something to catch.
import { spawn } from 'node:child_process'

export function spawnForbidden(): void {
  spawn('claude', ['--version'])
}
