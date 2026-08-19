import { defineConfig } from '@playwright/test'

// First Playwright test in the repo (task 6.8: `_electron` smoke test).
// Drives the REAL packaged production build (`out/main/index.js`), never
// the Vite dev server — same precedent as every prior slice's runtime
// harness (production CSP is strict; the dev-only relaxation from
// sdd/course-companion/bugfix/dev-csp-blank-window only applies when
// ELECTRON_RENDERER_URL is set, which it never is here).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list'
})
