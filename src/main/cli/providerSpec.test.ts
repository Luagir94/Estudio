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

  // Gemini is described but not offered. The list the app acts on must be a
  // subset of the table, never the other way round.
  it('offers only providers it has a spec for', () => {
    for (const provider of CLI_PROVIDERS) {
      expect(PROVIDER_SPECS[provider]).toBeDefined()
    }
    expect(CLI_PROVIDERS).not.toContain('gemini')
  })

  // The question travels on stdin. A template that carried a prompt-shaped
  // argument would be the one way user text could reach the cmd.exe command
  // line, which is the exact hole the sole-spawn-site boundary exists to close.
  it.each(ALL_SPECS)('%s carries no prompt-bearing argument in its templates', (provider) => {
    const spec = PROVIDER_SPECS[provider]
    for (const template of [spec.promptArgs, spec.streamingArgs ?? []]) {
      expect(template).not.toContain('--prompt')
      expect(template.some((token) => token.includes('${'))).toBe(false)
    }
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

  // Honesty about what was actually run. Claude's template was checked against
  // the installed binary; the other two were written from documentation, and
  // that difference is a spawn-time gate rather than a comment.
  it('marks only the templates that were run against a real binary as verified', () => {
    // Claude: checked against the installed CLI. Codex: checked against
    // codex-cli 0.148.0-alpha.15, which is where --skip-git-repo-check was
    // found. Gemini remains documentation-only until its binary exists here.
    expect(PROVIDER_SPECS.claude.verified).toBe(true)
    expect(PROVIDER_SPECS.codex.verified).toBe(true)
    expect(PROVIDER_SPECS.gemini.verified).toBe(false)
  })

  // The single flag whose absence killed every codex run before it reached the
  // model. The app's cwd is the attachments directory, never a git repository.
  it('lets codex run outside a git repository', () => {
    expect(PROVIDER_SPECS.codex.promptArgs).toContain('--skip-git-repo-check')
  })
})

describe('declaredCapabilities', () => {
  // The measured reason the warm session exists: ~15.5s for a cold spawn of
  // which only ~4s is inference. A provider without a duplex stdin pays that
  // on every question, and the app must not pretend otherwise.
  it('grants a warm session only to the provider that has a duplex stdin', () => {
    expect(declaredCapabilities('claude').warmSession).toBe(true)
    expect(declaredCapabilities('gemini').warmSession).toBe(false)
    expect(declaredCapabilities('codex').warmSession).toBe(false)
  })

  // Gemini's headless mode offers `--approval-mode` but no tool allowlist, so
  // its containment is circumstantial rather than contractual. Reporting that
  // honestly is the whole point of the flag.
  it('reports Gemini as having no read-only tool allowlist', () => {
    expect(declaredCapabilities('gemini').readOnlyTools).toBe(false)
    expect(declaredCapabilities('claude').readOnlyTools).toBe(true)
    expect(declaredCapabilities('codex').readOnlyTools).toBe(true)
  })
})
