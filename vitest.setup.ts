import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
// Initializes the shared i18next instance (synchronously — see that module)
// so component tests render real translations with no provider. i18next is
// environment-agnostic: harmless under the default 'node' environment.
import './src/renderer/i18n'

// Vitest does not auto-register Testing Library's afterEach(cleanup) the
// way Jest's global afterEach does — without this, each render() leaks DOM
// nodes into the next test in the same file (jsdom-environment tests only;
// harmless no-op under the 'node' environment since nothing was rendered).
afterEach(() => {
  cleanup()
})
