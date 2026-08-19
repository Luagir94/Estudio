import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tooling/**/*.test.ts'],
    // Default environment is 'node' (fast, matches domain/main/IPC tests).
    // Renderer component/container test files opt into a DOM individually
    // via a `// @vitest-environment jsdom` docblock (design §8: renderer
    // layer uses Vitest + Testing Library).
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: false,
    // `lucide-react` is a barrel that re-exports ~1771 separate icon modules.
    // Without pre-bundling, every worker walks that whole tree for each of the
    // 20 components that import an icon, which dominated the run (724s of
    // import time across the suite) and starved tests into 5s timeouts.
    // Pre-bundling collapses it into one cached artifact per environment.
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: ['lucide-react']
        }
      }
    }
  }
})
