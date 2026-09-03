import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MINIMUM_EXPECTED_MODULES, RULES, extractModuleReferences, scanFiles, scanProject } from './dependencyGuard.mts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('domain dependency guard', () => {
  it('fails a domain module that imports electron directly', () => {
    const file = 'src/renderer/materias/domain/__fixtures__/violatesElectronImport.ts'

    expect(scanFiles([file], repoRoot)).toEqual([
      { rule: 'no-electron-or-sqlite-in-domain', file, specifier: 'electron' }
    ])
  })

  it('fails a domain module that imports electron types only — rule 1 has no type-only exemption', () => {
    const file = 'src/renderer/materias/domain/__fixtures__/typeOnlyElectronImport.ts'

    expect(scanFiles([file], repoRoot)).toEqual([
      { rule: 'no-electron-or-sqlite-in-domain', file, specifier: 'electron' }
    ])
  })

  it('fails a main-process module outside claudeExecutableValidator.ts that imports child_process', () => {
    const file = 'src/main/claude/__fixtures__/violatesChildProcessImport.ts'

    expect(scanFiles([file], repoRoot)).toEqual([
      { rule: 'child-process-only-in-claude-validator', file, specifier: 'node:child_process' }
    ])
  })

  it('exempts type-only child_process imports outside the validator', () => {
    const violations = scanFiles(['src/main/claude/__fixtures__/typeOnlyChildProcessImport.ts'], repoRoot)

    expect(violations).toEqual([])
  })

  it('fails a module outside the listener that imports node:net (mcp-app-control PR10)', () => {
    const file = 'src/main/mcp/__fixtures__/violatesNetImport.ts'

    expect(scanFiles([file], repoRoot)).toEqual([{ rule: 'listener-only-in-mcp-slice', file, specifier: 'node:net' }])
  })

  it('exempts type-only node:net imports outside the listener', () => {
    const violations = scanFiles(['src/main/mcp/__fixtures__/typeOnlyNetImport.ts'], repoRoot)

    expect(violations).toEqual([])
  })

  it('clears pipeListener.ts and its colocated test despite their real node:net import', () => {
    // The exemption must cover the test as well as the implementation:
    // `scanProject` scans colocated `.test.ts` files too (only
    // `/__fixtures__/` paths are filtered), and `pipeListener.test.ts` opens
    // a real client socket to prove preamble limits, backoff and
    // `EADDRINUSE` — it could not do that without its own runtime
    // `node:net` import.
    const files = ['src/main/mcp/adapters/pipeListener.ts', 'src/main/mcp/adapters/pipeListener.test.ts']

    expect(scanFiles(files, repoRoot)).toEqual([])
  })

  it('exempts the not-yet-existing mcp-shim/index.ts by pattern, without needing the file to exist', () => {
    // `src/mcp-shim/index.ts` ships in a later PR; the exemption must already
    // tolerate that path today so the rule never has to change again when it
    // lands. `scanFiles` can only be exercised against real files, so this
    // asserts the rule's own `fromNot` pattern directly.
    const rule = RULES.find((candidate) => candidate.name === 'listener-only-in-mcp-slice')

    expect(rule).toBeDefined()
    expect(rule!.fromNot!.test('src/mcp-shim/index.ts')).toBe(true)
    // Every other file under src/ stays inside the guard universe.
    expect(rule!.fromNot!.test('src/main/mcp/adapters/mcpServerFactory.ts')).toBe(false)
  })
})

describe('module reference extraction', () => {
  it('reports dynamic import() and require() as runtime references', () => {
    const source = [
      'async function load() {',
      "  return import('node:child_process')",
      '}',
      "const eager = require('child_process')",
      'export { load, eager }'
    ].join('\n')

    const refs = extractModuleReferences(source, { tsx: false })

    expect(refs).toContainEqual({ specifier: 'node:child_process', typeOnly: false })
    expect(refs).toContainEqual({ specifier: 'child_process', typeOnly: false })
  })

  it('reports a no-substitution template literal import() as a runtime reference', () => {
    const source = ['async function load() {', '  return import(`node:child_process`)', '}', 'export { load }'].join(
      '\n'
    )

    expect(extractModuleReferences(source, { tsx: false })).toEqual([
      { specifier: 'node:child_process', typeOnly: false }
    ])
  })

  it('reports type-position import() references as type-only', () => {
    const refs = extractModuleReferences(
      [
        "type Win = import('electron').BrowserWindow",
        "declare const db: typeof import('better-sqlite3')",
        'export type X = Win'
      ].join('\n'),
      { tsx: false }
    )

    expect(refs).toContainEqual({ specifier: 'electron', typeOnly: true })
    expect(refs).toContainEqual({ specifier: 'better-sqlite3', typeOnly: true })
  })

  it('treats an import with only inline type specifiers as type-only', () => {
    const refs = extractModuleReferences("import { type ChildProcess, type SpawnOptions } from 'node:child_process'", {
      tsx: false
    })

    expect(refs).toEqual([{ specifier: 'node:child_process', typeOnly: true }])
  })

  it('treats a mixed value-and-type import as a runtime reference', () => {
    // Mirrors the validator's own import shape: `spawn` is a runtime binding,
    // so the inline type specifiers must not launder the whole declaration.
    const refs = extractModuleReferences(
      "import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'",
      { tsx: false }
    )

    expect(refs).toEqual([{ specifier: 'node:child_process', typeOnly: false }])
  })

  it('reports re-exports and distinguishes type-only ones', () => {
    const refs = extractModuleReferences(
      ["export { spawn } from 'node:child_process'", "export type { ChildProcess } from 'child_process'"].join('\n'),
      { tsx: false }
    )

    expect(refs).toContainEqual({ specifier: 'node:child_process', typeOnly: false })
    expect(refs).toContainEqual({ specifier: 'child_process', typeOnly: true })
  })

  it('reports import-equals declarations', () => {
    expect(
      extractModuleReferences("import cp = require('child_process')\nexport const x = cp", { tsx: false })
    ).toEqual([{ specifier: 'child_process', typeOnly: false }])
  })

  it('parses tsx sources', () => {
    const refs = extractModuleReferences("import { app } from 'electron'\nexport const El = () => <div>{app}</div>", {
      tsx: true
    })

    expect(refs).toEqual([{ specifier: 'electron', typeOnly: false }])
  })

  it('parses plain-JS sources — non-TS files under src are inside the guard universe', () => {
    expect(
      extractModuleReferences("const db = require('better-sqlite3')\nmodule.exports = db", { tsx: false })
    ).toEqual([{ specifier: 'better-sqlite3', typeOnly: false }])
  })
})

describe('whole-tree scan', () => {
  /*
   * The guard's predecessor (dependency-cruiser) once "passed" while scanning
   * zero modules: its parser could not read the sources under TypeScript 7,
   * every rule held vacuously, and the suite stayed green. This assertion
   * turns a dead or partially-dead scan into a failing build — the threshold
   * is shared with the CLI so the two gates cannot drift apart.
   */
  it('covers the real source tree instead of passing vacuously', { timeout: 30_000 }, () => {
    const { files, violations } = scanProject(repoRoot)

    expect(files.length).toBeGreaterThan(MINIMUM_EXPECTED_MODULES)
    expect(violations).toEqual([])
  })
})

describe('cli entrypoint', () => {
  /*
   * The npm `lint:deps` gate is the spawned CLI, not the exported functions —
   * so the CLI path itself needs proof it runs, scans, and reports. This also
   * pins the executed-as-script detection: if it ever stops recognizing the
   * entry (realpath drift, Node behavior change), the empty stdout fails here
   * instead of lint:deps silently exiting 0.
   */
  it('scans the tree and reports the module count with exit code 0', { timeout: 60_000 }, () => {
    const stdout = execFileSync(process.execPath, [path.join('tooling', 'dependencyGuard.mts')], {
      cwd: repoRoot,
      encoding: 'utf8'
    })

    expect(stdout).toMatch(/no dependency violations found \(\d+ modules scanned\)/)
  })
})
