import { describe, expect, it } from 'vitest'
import {
  CLI_PROVIDERS,
  cliProviderSchema,
  enabledCliProviderSchema,
  isProviderEnabled,
  modelIdSchema,
  type CliProvider
} from './cli'

// The shared provider contract has two gates that look alike and are not: the
// WIDE enum, which admits every provider the app has a spec for, and the
// ENABLED gate, which admits only the ones this build offers. These tests pin
// the difference, because the day they stop differing is the day the second one
// silently stops protecting anything.

/**
 * A provider id this build does not offer.
 *
 * Gemini used to be the real instance of that: described in the table, absent
 * from `CLI_PROVIDERS`. It is gone — Google deprecated the free-tier Gemini CLI
 * in favour of Antigravity — and every provider the wide contract now admits is
 * enabled. That is a fact about today's TABLE, not about the gate, and the gate
 * has to keep biting the moment it stops being true, so it is exercised here
 * against a fixture id standing exactly where a disabled provider would.
 */
const NOT_OFFERED = 'fixture-cli' as CliProvider

describe('CLI_PROVIDERS', () => {
  it('offers the CLIs this build was verified against, in menu order', () => {
    expect(CLI_PROVIDERS).toEqual(['claude', 'antigravity', 'codex'])
  })

  // The enabled list is a SUBSET of the wide enum, never the other way round:
  // the provider key selects an argv template from a static table, so a name
  // the table does not describe must not be offerable.
  it('never offers a provider the wide contract does not admit', () => {
    for (const provider of CLI_PROVIDERS) {
      expect(cliProviderSchema.options).toContain(provider)
    }
  })
})

describe('isProviderEnabled', () => {
  it.each(CLI_PROVIDERS)('reports %s as enabled', (provider) => {
    expect(isProviderEnabled(provider)).toBe(true)
  })

  it('reports a provider this build does not offer as disabled', () => {
    expect(isProviderEnabled(NOT_OFFERED)).toBe(false)
  })
})

describe('enabledCliProviderSchema', () => {
  it.each(CLI_PROVIDERS)('accepts %s on the write side', (provider) => {
    expect(enabledCliProviderSchema.parse(provider)).toBe(provider)
  })

  // The write-side gate is what stops a disabled or unknown provider reaching a
  // settings key or a spawn through a question or an override payload.
  it('refuses a provider this build does not offer', () => {
    expect(enabledCliProviderSchema.safeParse(NOT_OFFERED).success).toBe(false)
  })
})

describe('modelIdSchema', () => {
  // Antigravity serves Gemini models, so its ids are legitimately named after
  // them. They still have to clear the SAME character whitelist every other id
  // does — a baseline the picker offers but the spawn boundary would refuse is
  // the one failure worse than not offering it at all.
  it.each(['gemini-3.1-pro-high', 'claude-sonnet-4-6', 'gpt-oss-120b-medium'])(
    'accepts the Antigravity model id %s',
    (modelId) => {
      expect(modelIdSchema.parse(modelId)).toBe(modelId)
    }
  )
})
