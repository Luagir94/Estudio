import { describe, expect, it } from 'vitest'
import { declaredCapabilities, PROVIDER_SPECS } from './providerSpec'
import { cliProviderSchema, CLI_PROVIDERS } from '../../shared/ipc/cli'

/** Every provider the table describes, enabled or not. */
const ALL_SPECS = cliProviderSchema.options

// Invariants that must hold for EVERY provider, present and future. The point
// of a table is that adding a row is cheap; the point of these tests is that
// adding a row cannot quietly weaken the boundary the table feeds.

describe('PROVIDER_SPECS', () => {
  it('covers every provider the shared contract admits', () => {
    expect(Object.keys(PROVIDER_SPECS).sort()).toEqual([...ALL_SPECS].sort())
  })

  // The invariant that would have caught shipping an unverified provider.
  //
  // The capability probe is a FLOOR, not a proof: it greps the help page for
  // the flags the template already names, so a REQUIRED flag the template
  // forgot is invisible to it. Codex proved that — its template was missing
  // --skip-git-repo-check, the probe cleared it happily, and every run would
  // have died before reaching the model.
  //
  // So the only real guarantee is that a human ran the binary. This makes that
  // non-negotiable: enabling a provider without verifying it is a failing test,
  // not a judgement call.
  it('never offers a provider whose template was not run against a real binary', () => {
    for (const provider of CLI_PROVIDERS) {
      expect(PROVIDER_SPECS[provider].verified).toBe(true)
    }
  })

  // Every provider the table describes is offered today, but the direction of
  // the relationship is what matters: the list the app acts on must stay a
  // subset of the table, never the other way round.
  it('offers only providers it has a spec for', () => {
    for (const provider of CLI_PROVIDERS) {
      expect(PROVIDER_SPECS[provider]).toBeDefined()
    }
    expect([...ALL_SPECS]).toEqual(expect.arrayContaining([...CLI_PROVIDERS]))
  })

  // No template may carry an interpolation slot. The one caller-supplied value
  // that reaches argv is the question of an `argv`-delivery provider, and it is
  // spliced at the spawn boundary as ONE element after a flag named below —
  // never assembled into a token by a template that pretends to be static.
  it.each(ALL_SPECS)('%s interpolates nothing into its templates', (provider) => {
    const spec = PROVIDER_SPECS[provider]
    for (const template of [spec.promptArgs, spec.streamingArgs ?? []]) {
      expect(template.some((token) => token.includes('${'))).toBe(false)
    }
  })

  // The delivery discriminant, asserted as a TABLE invariant rather than per
  // provider: whichever way a question travels, that fact is declared here and
  // read at the spawn site, so no spawn ever branches on a provider's name.
  it.each(ALL_SPECS)('%s declares how its question reaches the CLI', (provider) => {
    const spec = PROVIDER_SPECS[provider]

    if (spec.promptDelivery === 'stdin') {
      // Nothing prompt-shaped in argv at all: stdin delivery is what keeps user
      // text away from the cmd.exe command line the shim branch composes.
      expect(spec.promptFlag).toBeNull()
      expect(spec.promptArgs).not.toContain('--prompt')
      return
    }

    // An argv provider must name the flag whose VALUE the question becomes, and
    // that flag must already be in its own template — the splice happens after
    // it, so a template that never mentions it could not be composed at all.
    expect(spec.promptFlag).not.toBeNull()
    expect(spec.promptArgs).toContain(spec.promptFlag)
    // A live streaming process cannot be handed a new argv between questions,
    // so argv delivery and a warm session are mutually exclusive by definition.
    expect(spec.streamingArgs).toBeNull()
  })

  // Containment under global cross-subject scope. No template may ask any CLI
  // to skip its own permission checks or auto-approve its own actions.
  it.each(ALL_SPECS)('%s never asks its CLI to bypass approval', (provider) => {
    const spec = PROVIDER_SPECS[provider]
    const all = [...spec.promptArgs, ...(spec.streamingArgs ?? [])].join(' ')
    for (const forbidden of ['--dangerously-skip-permissions', '--yolo', 'danger-full-access', 'bypassPermissions']) {
      expect(all).not.toContain(forbidden)
    }
  })

  it.each(ALL_SPECS)('%s declares a version vector and a help vector', (provider) => {
    const spec = PROVIDER_SPECS[provider]
    expect(spec.versionArgs.length).toBeGreaterThan(0)
    expect(spec.helpArgs.length).toBeGreaterThan(0)
  })

  // The connection probe reads a version with ONE shared code path, so a
  // provider that needed a different vector would break it silently.
  it.each(ALL_SPECS)('%s reports its version through --version', (provider) => {
    expect(PROVIDER_SPECS[provider].versionArgs).toEqual(['--version'])
  })

  // Honesty about what was actually run. Every template in the table has now
  // been executed against its real binary by a human, and that is a spawn-time
  // gate rather than a comment: `clearProvider` refuses anything else.
  it('marks only the templates that were run against a real binary as verified', () => {
    // Claude: checked against the installed CLI. Codex: checked against
    // codex-cli 0.148.0-alpha.15, which is where --skip-git-repo-check was
    // found. Antigravity: checked against agy.exe 1.1.15 on Windows.
    expect(PROVIDER_SPECS.claude.verified).toBe(true)
    expect(PROVIDER_SPECS.codex.verified).toBe(true)
    expect(PROVIDER_SPECS.antigravity.verified).toBe(true)
  })

  // The single flag whose absence killed every codex run before it reached the
  // model. The app's cwd is the attachments directory, never a git repository.
  it('lets codex run outside a git repository', () => {
    expect(PROVIDER_SPECS.codex.promptArgs).toContain('--skip-git-repo-check')
  })

  // `--mode plan` is agy's read-only mode, and it is the ONLY thing standing
  // between this app and an agent that can edit the student's files. The app
  // answers questions about study material; it never writes.
  it('asks Antigravity for its read-only planning mode', () => {
    expect(PROVIDER_SPECS.antigravity.promptArgs).toEqual(expect.arrayContaining(['--mode', 'plan']))
    expect(PROVIDER_SPECS.antigravity.readOnlyTools).toBe(true)
  })

  // Verified against the real binary: `--print` is a required-VALUE flag that
  // never reads the prompt from stdin, which is why this provider alone
  // delivers its question on argv.
  it('carries the Antigravity question as the value of --print', () => {
    expect(PROVIDER_SPECS.antigravity.promptDelivery).toBe('argv')
    expect(PROVIDER_SPECS.antigravity.promptFlag).toBe('--print')
  })

  // Byte-identical delivery for the two providers that already worked: their
  // question still travels on stdin, and nothing about this table moved it.
  it.each(['claude', 'codex'] as const)('keeps the %s question on stdin', (provider) => {
    expect(PROVIDER_SPECS[provider].promptDelivery).toBe('stdin')
  })
})

describe('declaredCapabilities', () => {
  // The measured reason the warm session exists: ~15.5s for a cold spawn of
  // which only ~4s is inference. A provider without a duplex stdin pays that
  // on every question, and the app must not pretend otherwise.
  it('grants a warm session only to the provider that has a duplex stdin', () => {
    expect(declaredCapabilities(PROVIDER_SPECS.claude).warmSession).toBe(true)
    expect(declaredCapabilities(PROVIDER_SPECS.antigravity).warmSession).toBe(false)
    expect(declaredCapabilities(PROVIDER_SPECS.codex).warmSession).toBe(false)
  })

  // Read-only containment is a property of a provider's argv VOCABULARY, so it
  // is read off the spec rather than decided by a name comparison. All three
  // state it at the spawn boundary today — `--allowed-tools`, `--mode plan`,
  // `--sandbox read-only` — and a provider that could not would say so here.
  it('reports read-only containment from the spec, never from the provider name', () => {
    for (const provider of ALL_SPECS) {
      expect(declaredCapabilities(PROVIDER_SPECS[provider]).readOnlyTools).toBe(PROVIDER_SPECS[provider].readOnlyTools)
    }
    expect(ALL_SPECS.every((provider) => PROVIDER_SPECS[provider].readOnlyTools)).toBe(true)
  })
})
