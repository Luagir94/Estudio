import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cruise } from 'dependency-cruiser'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function loadDependencyCruiserConfig(): Promise<{
  forbidden: unknown[]
  options?: Record<string, unknown>
}> {
  const configPath = path.join(repoRoot, '.dependency-cruiser.cjs')
  const configModule = (await import(configPath)) as {
    default: { forbidden: unknown[]; options?: Record<string, unknown> }
  }
  return configModule.default
}

/*
 * `cruise()` resolves the module graph from disk, so this test gets slower as
 * the codebase grows and slower still under the CPU contention of a full-suite
 * run. Vitest's 5s default made it flake — it passed standalone and timed out
 * in the suite. The generous timeout is about the harness, not the assertion:
 * the guard itself is also enforced by `npm run lint:deps`.
 */
const CRUISE_TIMEOUT_MS = 60_000

describe('domain dependency guard (dependency-cruiser)', () => {
  it('fails a domain module that imports electron directly', { timeout: CRUISE_TIMEOUT_MS }, async () => {
    const config = await loadDependencyCruiserConfig()

    const result = await cruise(
      ['src/renderer/materias/domain/__fixtures__/violatesElectronImport.ts'],
      {
        validate: true,
        ruleSet: { forbidden: config.forbidden as never },
        ...config.options
      },
      undefined,
      undefined
    )

    if (result.output === undefined || typeof result.output === 'string') {
      throw new Error('Expected dependency-cruiser to return a structured cruise result')
    }

    const violations = result.output.summary.violations.filter(
      (violation) => violation.rule.name === 'no-electron-or-sqlite-in-domain'
    )

    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]?.to).toMatch(/electron/)
  })

  /*
   * `child-process-only-in-claude-validator` (design D3 / spec "Sole Spawn
   * Site") has never been exercised elsewhere in this repo before this test:
   * `.dependency-cruiser.cjs` resolves `tsConfig: 'tsconfig.web.json'`, whose
   * `include` only covers `src/renderer`, `src/shared` and `vitest.setup.ts`
   * — `src/main` is outside it. Core-module dependency detection (`node:` /
   * bare `child_process`) turned out not to require tsconfig project
   * membership to resolve correctly, so the rule fires here with the SAME
   * options used for the renderer rule above — verified empirically before
   * writing this assertion, not assumed from the rule compiling cleanly.
   */
  it(
    'fails a main-process module outside claudeExecutableValidator.ts that imports child_process',
    { timeout: CRUISE_TIMEOUT_MS },
    async () => {
      const config = await loadDependencyCruiserConfig()

      const result = await cruise(
        ['src/main/claude/__fixtures__/violatesChildProcessImport.ts'],
        {
          validate: true,
          ruleSet: { forbidden: config.forbidden as never },
          ...config.options
        },
        undefined,
        undefined
      )

      if (result.output === undefined || typeof result.output === 'string') {
        throw new Error('Expected dependency-cruiser to return a structured cruise result')
      }

      const violations = result.output.summary.violations.filter(
        (violation) => violation.rule.name === 'child-process-only-in-claude-validator'
      )

      expect(violations.length).toBeGreaterThan(0)
      expect(violations[0]?.to).toMatch(/child_process/)
    }
  )
})
