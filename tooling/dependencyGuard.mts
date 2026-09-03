/*
 * In-repo dependency guard. Replaces dependency-cruiser, which cannot parse
 * sources under TypeScript 7 (its supported range is `>=2.0.0 <7.0.0` and the
 * TS 7 native compiler ships no stable JS API for it to use) — under TS 7 it
 * silently cruised 0 modules and every rule passed vacuously. This guard
 * parses with @swc/core instead, which needs no `typescript` package at all,
 * and refuses to pass when the scan comes back suspiciously small.
 *
 * Run as a CLI (`npm run lint:deps`) or import from tests.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import swc from '@swc/core'

export type ModuleReference = { specifier: string; typeOnly: boolean }
export type Violation = { rule: string; file: string; specifier: string }

type Rule = {
  name: string
  /** repo-root-relative POSIX path pattern the importing file must match */
  from: RegExp
  /** files matching this are exempt even when `from` matches */
  fromNot?: RegExp
  /** import specifier pattern that constitutes a violation */
  to: RegExp
  /** when true, type-only references are allowed (they carry no runtime footprint) */
  exemptTypeOnly: boolean
  /**
   * Substrings for the parse pre-filter: every specifier `to` can match MUST
   * contain at least one of these, so a source file containing none of them
   * can never violate the rule and needs no AST. Soundness is pinned by the
   * fixture tests — a rule whose hints stop covering its `to` pattern fails
   * them.
   */
  contentHints: string[]
}

export const RULES: Rule[] = [
  {
    // Domain modules are the pure, framework-free core of each
    // screaming-architecture slice. They must never import Electron or the
    // native SQLite driver — those belong in adapters (see design §1, §4:
    // "Renderer never imports Node APIs"). No type-only exemption: naming
    // Electron types already couples the domain to the framework.
    // NOTE: matches the RAW specifier, not the resolved path. The repo has no
    // tsconfig `paths` or bundler aliases today; if one is ever added, extend
    // the guard to resolve aliases or an aliased route could launder these.
    name: 'no-electron-or-sqlite-in-domain',
    from: /^src\/renderer\/[^/]+\/domain/,
    to: /^(electron|better-sqlite3)(\/|$)/,
    exemptTypeOnly: false,
    contentHints: ['electron', 'better-sqlite3']
  },
  {
    // child_process is the sole spawn trust boundary for this app (design D3,
    // spec "Sole Spawn Site"): every subprocess launch must pass through
    // claudeExecutableValidator.ts pre-spawn validation first. The bare
    // `child_process` form would miss the `node:child_process` specifier, so
    // the pattern matches both. Type-only imports are exempt — they carry no
    // runtime footprint, so services and tests may import `ChildProcess` /
    // `SpawnOptions` types for their spawn doubles.
    name: 'child-process-only-in-claude-validator',
    from: /^src\//,
    fromNot: /^src\/main\/claude\/claudeExecutableValidator\.ts$/,
    to: /^(node:)?child_process$/,
    exemptTypeOnly: true,
    contentHints: ['child_process']
  },
  {
    // The internal MCP leg's socket boundary is the sole `node:net`/`http`
    // trust boundary for this app (design D4/D10, mcp-app-control PR10):
    // every other module reaches it only through the `ListenerPort` seam
    // `mcpService.ts` (PR9) declares and consumes. Baseline verified clean
    // (zero matching runtime imports under `src/` before this rule shipped).
    // `pipeListener.test.ts` is exempted alongside its subject because it is
    // the only way to prove preamble limits, backoff and `EADDRINUSE`
    // against a real socket — `scanProject` scans colocated tests too, only
    // `/__fixtures__/` paths are filtered (see `scanProject` below), so a
    // test that dials a real server must be exempted explicitly, not just
    // its implementation. `src/mcp-shim/index.ts` does not exist yet (it
    // ships in a later PR) — an unmatched alternative in this pattern is
    // harmless, `scanProject` only ever tests it against files that exist.
    name: 'listener-only-in-mcp-slice',
    from: /^src\//,
    fromNot: /^src\/(main\/mcp\/adapters\/pipeListener(\.test)?\.ts|mcp-shim\/index\.ts)$/,
    to: /^(node:)?(net|http|https|http2)$/,
    exemptTypeOnly: true,
    contentHints: ['net', 'http']
  }
]

// Everything the bundler would pick up under src/, not just TypeScript —
// dependency-cruiser scanned plain-JS extensions too, and a `.cjs` with a
// `require('better-sqlite3')` must not be invisible to the rules.
const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const TSX_EXTENSIONS = /\.(tsx|jsx)$/

/**
 * Shared anti-vacuity floor for the CLI and the test suite: a scan that sees
 * fewer modules than this has lost sight of the codebase (the tree holds ~270
 * and only grows), so both gates refuse instead of passing on a partial scan.
 */
export const MINIMUM_EXPECTED_MODULES = 100

type SwcNode = { type?: string } & Record<string, unknown>

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

/*
 * An import declaration is type-only when declared `import type ...`, or when
 * every one of its specifiers is an inline `type` specifier. A single runtime
 * binding (`import { spawn, type ChildProcess } ...`) makes the whole
 * declaration a runtime reference — inline types must not launder it.
 */
function declarationIsTypeOnly(node: SwcNode): boolean {
  if (node.typeOnly === true) return true
  const specifiers = node.specifiers
  if (!Array.isArray(specifiers) || specifiers.length === 0) return false
  return specifiers.every((specifier: SwcNode) => specifier.isTypeOnly === true)
}

function specifierOf(node: SwcNode): string | undefined {
  const source = node.source as SwcNode | undefined
  return typeof source?.value === 'string' ? source.value : undefined
}

// A statically-known specifier: a string literal, or a template literal with
// no substitutions (`import(`node:child_process`)` is an ordinary way to
// write a real import and must not slip past the trust-boundary rule).
// Specifiers built at runtime cannot be resolved statically and are skipped.
function literalSpecifier(node: SwcNode | undefined): string | undefined {
  if (node?.type === 'StringLiteral' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral') {
    const expressions = node.expressions
    const quasis = node.quasis
    if (Array.isArray(expressions) && expressions.length === 0 && Array.isArray(quasis) && quasis.length === 1) {
      const quasi = quasis[0] as SwcNode
      const text = typeof quasi.cooked === 'string' ? quasi.cooked : quasi.raw
      if (typeof text === 'string') return text
    }
  }
  return undefined
}

function collectReferences(node: unknown, references: ModuleReference[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectReferences(item, references)
    return
  }
  if (node === null || typeof node !== 'object') return

  const swcNode = node as SwcNode
  switch (swcNode.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration': {
      const specifier = specifierOf(swcNode)
      if (specifier !== undefined) references.push({ specifier, typeOnly: declarationIsTypeOnly(swcNode) })
      break
    }
    // Type-position `import('x')` — `type W = import('electron').BrowserWindow`.
    // Always type-only, which rule 1 deliberately still flags.
    case 'TsImportType': {
      const argument = swcNode.argument as SwcNode | undefined
      if (typeof argument?.value === 'string') references.push({ specifier: argument.value, typeOnly: true })
      break
    }
    case 'TsImportEqualsDeclaration': {
      const moduleRef = swcNode.moduleRef as SwcNode | undefined
      const expression = moduleRef?.expression as SwcNode | undefined
      if (moduleRef?.type === 'TsExternalModuleReference' && typeof expression?.value === 'string') {
        references.push({ specifier: expression.value, typeOnly: swcNode.isTypeOnly === true })
      }
      break
    }
    case 'CallExpression': {
      const callee = swcNode.callee as SwcNode | undefined
      const args = swcNode.arguments as Array<{ expression?: SwcNode }> | undefined
      const isDynamicImport = callee?.type === 'Import'
      const isRequire = callee?.type === 'Identifier' && callee.value === 'require'
      if (isDynamicImport || isRequire) {
        const specifier = literalSpecifier(args?.[0]?.expression)
        if (specifier !== undefined) references.push({ specifier, typeOnly: false })
      }
      break
    }
  }

  for (const [key, value] of Object.entries(swcNode)) {
    // `span` subtrees hold only positions — recursing into them roughly
    // triples the walk for nothing.
    if (key === 'span') continue
    collectReferences(value, references)
  }
}

export function extractModuleReferences(source: string, options: { tsx: boolean }): ModuleReference[] {
  const ast = swc.parseSync(source, {
    syntax: 'typescript',
    tsx: options.tsx,
    decorators: true,
    target: 'es2022'
  })
  const references: ModuleReference[] = []
  collectReferences(ast.body, references)
  return references
}

const ALL_CONTENT_HINTS = RULES.flatMap((rule) => rule.contentHints)

export function scanFiles(files: string[], rootDir: string): Violation[] {
  const violations: Violation[] = []
  for (const file of files) {
    const posixFile = toPosix(file)
    let source: string
    try {
      source = readFileSync(path.join(rootDir, file), 'utf8')
    } catch (error) {
      throw new Error(`dependency guard could not read ${posixFile}: ${String(error)}`)
    }
    // Parse pre-filter: a file containing none of the hint substrings cannot
    // produce a specifier any rule matches (only literal specifiers are ever
    // recorded), so it needs no AST. Cuts the parse set ~80% on this repo.
    if (!ALL_CONTENT_HINTS.some((hint) => source.includes(hint))) continue
    let references: ModuleReference[]
    try {
      references = extractModuleReferences(source, { tsx: TSX_EXTENSIONS.test(posixFile) })
    } catch (error) {
      // Fail closed, but name the file — a parse error inside a 260-file scan
      // is undiagnosable without it.
      throw new Error(`dependency guard could not parse ${posixFile}: ${String(error)}`)
    }
    for (const rule of RULES) {
      if (!rule.from.test(posixFile)) continue
      if (rule.fromNot?.test(posixFile)) continue
      for (const reference of references) {
        if (!rule.to.test(reference.specifier)) continue
        if (rule.exemptTypeOnly && reference.typeOnly) continue
        violations.push({ rule: rule.name, file: posixFile, specifier: reference.specifier })
      }
    }
  }
  return violations
}

export function scanProject(rootDir: string): { files: string[]; violations: Violation[] } {
  const entries = readdirSync(path.join(rootDir, 'src'), { recursive: true }) as string[]
  const files = entries
    .map((entry) => `src/${toPosix(entry)}`)
    .filter((entry) => SOURCE_EXTENSIONS.test(entry) && !entry.includes('/__fixtures__/'))
    .sort()
  return { files, violations: scanFiles(files, rootDir) }
}

// Canonicalize through realpath so symlinked/junctioned checkouts (OneDrive
// redirects, pnpm workspaces, /tmp on macOS) still recognize the entry module:
// Node realpaths the ESM entry for import.meta.url while argv[1] keeps the
// link path, and a mismatch here must never silently skip the scan.
function canonicalPath(candidate: string): string {
  const resolved = realpathSync(candidate)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const executedAsScript = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return canonicalPath(path.resolve(process.argv[1])) === canonicalPath(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (executedAsScript) {
  const { files, violations } = scanProject(process.cwd())
  if (files.length < MINIMUM_EXPECTED_MODULES) {
    // A guard that sees (almost) nothing proves nothing — refuse the vacuous
    // pass instead of reporting a cheerful count over a collapsed scan.
    console.error(
      `✖ scanned only ${files.length} modules (expected more than ${MINIMUM_EXPECTED_MODULES}): ` +
        'the guard has lost sight of the codebase, refusing to pass vacuously'
    )
    process.exit(1)
  }
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`  error ${violation.rule}: ${violation.file} → ${violation.specifier}`)
    }
    console.error(`✖ ${violations.length} dependency violation(s) (${files.length} modules scanned)`)
    process.exit(1)
  }
  console.log(`✔ no dependency violations found (${files.length} modules scanned)`)
}
