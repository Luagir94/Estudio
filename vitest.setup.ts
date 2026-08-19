import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Vitest does not auto-register Testing Library's afterEach(cleanup) the
// way Jest's global afterEach does — without this, each render() leaks DOM
// nodes into the next test in the same file (jsdom-environment tests only;
// harmless no-op under the 'node' environment since nothing was rendered).
afterEach(() => {
  cleanup()
})
