/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-electron-or-sqlite-in-domain',
      severity: 'error',
      comment:
        'Domain modules are the pure, framework-free core of each screaming-architecture ' +
        'slice. They must never import Electron or the native SQLite driver — those belong ' +
        'in adapters (see design §1, §4: "Renderer never imports Node APIs").',
      from: { path: '^src/renderer/[^/]+/domain' },
      to: { path: '(^|/)node_modules/(electron|better-sqlite3)(/|$)' }
    },
    {
      name: 'child-process-only-in-claude-validator',
      severity: 'error',
      comment:
        'child_process is the sole spawn trust boundary for this app (design D3, spec ' +
        '"Sole Spawn Site"): every subprocess launch must pass through ' +
        'claudeExecutableValidator.ts pre-spawn validation first. The bare `(^|/)child_process` ' +
        'form would miss the `node:child_process` specifier, so the pattern matches both. ' +
        'type-only imports are excluded — they carry no runtime footprint, so the sibling ' +
        'test file may import `ChildProcess`/`SpawnOptions` types for its spawn doubles.',
      from: { pathNot: '^src/main/claude/claudeExecutableValidator\\.ts$' },
      to: { path: '^(node:)?child_process$', dependencyTypes: ['core'], dependencyTypesNot: ['type-only'] }
    }
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.web.json' },
    doNotFollow: { path: 'node_modules' }
  }
}
