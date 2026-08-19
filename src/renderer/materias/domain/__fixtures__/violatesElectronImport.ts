// Intentionally invalid fixture — proves the dependency guard (task 1.6/1.7)
// actually fails the build when a `domain/` module imports Electron or the
// native SQLite driver. Never import this file from production code; it
// exists only so `tooling/dependencyGuard.test.ts` has something to catch.
import { BrowserWindow } from 'electron'

export function createForbiddenWindow(): BrowserWindow {
  return new BrowserWindow()
}
