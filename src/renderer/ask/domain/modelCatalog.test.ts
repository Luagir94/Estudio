import { describe, expect, it } from 'vitest'
import { CLI_PROVIDERS, type DiscoveredModel } from '../../../shared/ipc/cli'
import { ASK_BASELINE_MODELS, ASK_RECOMMENDED_MODELS } from './askDisplay'
import { buildModelGroups, humanizeModelId } from './modelCatalog'

const BASELINE = [
  { provider: 'claude' as const, modelId: 'claude-sonnet-5' },
  { provider: 'claude' as const, modelId: 'claude-opus-5' }
]
const RECOMMENDED = ['claude-sonnet-5', 'claude-opus-5']

// Every CLI connected is the DEFAULT for these cases: this file is about how
// models are grouped, named and ranked, and the permission filter has its own
// cases at the bottom.
const build = (discovered: DiscoveredModel[] = [], recommended = RECOMMENDED) =>
  buildModelGroups({ baseline: BASELINE, recommended, discovered, available: CLI_PROVIDERS })

const flatten = (discovered: DiscoveredModel[] = []) => build(discovered).flatMap((group) => group.options)

describe('humanizeModelId', () => {
  it.each([
    ['claude-sonnet-5', 'Sonnet 5'],
    ['claude-opus-5', 'Opus 5'],
    // The date stamp is a build identifier, not something a student chooses by.
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    // The context-window variant is the WHOLE reason the id differs, so it
    // must survive into the name — two rows reading "Opus 5" would be a lie.
    ['claude-opus-5[1m]', 'Opus 5 · 1M'],
    ['claude-fable-5[1m]', 'Fable 5 · 1M'],
    ['claude-sonnet-5[200k]', 'Sonnet 5 · 200K'],
    ['sonnet', 'Sonnet'],
    // A vendor acronym is a proper noun, not a word to title-case.
    ['gpt-5-codex', 'GPT 5 Codex'],
    ['gpt-5.6-terra', 'GPT 5.6 Terra'],
    ['gpt-5.4-mini', 'GPT 5.4 Mini'],
    ['gpt-5.5', 'GPT 5.5'],
    ['o3', 'O3']
  ])('names %s as %s', (modelId, expected) => {
    expect(humanizeModelId(modelId)).toBe(expected)
  })
})

describe('buildModelGroups', () => {
  it('groups the options under the CLI they belong to', () => {
    const groups = build([{ provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: null }])

    expect(groups.map((group) => [group.provider, group.label])).toEqual([
      ['claude', 'Claude Code'],
      ['codex', 'Codex CLI']
    ])
  })

  // A CLI the student does not have must not leave an empty heading behind.
  it('omits a CLI that has no options at all', () => {
    expect(build().map((group) => group.provider)).toEqual(['claude'])
  })

  it('appends a discovered model after the baseline of its own CLI', () => {
    const options = flatten([{ provider: 'claude', modelId: 'claude-fable-5[1m]', origin: 'catalog', rank: null }])

    expect(options.map((option) => option.modelId)).toEqual(['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5[1m]'])
  })

  // `toContainEqual` matches the WHOLE shape, so these also pin that no
  // description field survives: the menu no longer describes models (design
  // `Screen — Preguntar · Modelo`), and a stray field here would be the old
  // mechanism quietly coming back.
  it('names every option from its id alone', () => {
    const options = flatten([{ provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: null }])

    expect(options).toContainEqual({
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      name: 'Sonnet 5',
      recommended: true
    })
    expect(options).toContainEqual({
      provider: 'codex',
      modelId: 'gpt-5.6-terra',
      name: 'GPT 5.6 Terra',
      recommended: false
    })
  })

  it('never lists a model twice, however many sources report it', () => {
    const twice: DiscoveredModel[] = [
      { provider: 'claude', modelId: 'claude-sonnet-5', origin: 'catalog', rank: null },
      { provider: 'claude', modelId: 'claude-opus-5[1m]', origin: 'catalog', rank: null },
      { provider: 'claude', modelId: 'claude-opus-5[1m]', origin: 'used', rank: null }
    ]

    expect(flatten(twice).map((option) => option.modelId)).toEqual([
      'claude-sonnet-5',
      'claude-opus-5',
      'claude-opus-5[1m]'
    ])
  })

  // The same id under a different CLI is a different model.
  it('treats provider as part of a model identity', () => {
    const options = flatten([{ provider: 'codex', modelId: 'claude-sonnet-5', origin: 'used', rank: null }])

    expect(options.filter((option) => option.modelId === 'claude-sonnet-5')).toHaveLength(2)
  })

  // The bug this guards against, reported against the real app: a group with
  // zero options is dropped, so an ENABLED CLI the app can name no model for is
  // simply ABSENT from the picker — connected in Ajustes, invisible in the
  // panel, with nothing on screen to explain the difference.
  //
  // Antigravity is the provider where that bites hardest. Claude and Codex both
  // write model state this app can read; agy publishes its lineup through a
  // `models` SUBCOMMAND (a live network call), which nothing here reads, so
  // discovery contributes nothing for it and the baseline is its ONLY route
  // into the menu.
  it('gives Antigravity a section from the app baseline alone, with nothing discovered', () => {
    const groups = buildModelGroups({
      available: CLI_PROVIDERS,
      baseline: ASK_BASELINE_MODELS,
      recommended: ASK_RECOMMENDED_MODELS,
      discovered: []
    })

    const antigravity = groups.find((group) => group.provider === 'antigravity')
    expect(antigravity?.label).toBe('Antigravity CLI')
    expect(antigravity?.options.map((option) => option.modelId)).toEqual(['gemini-3.1-pro-high', 'claude-sonnet-4-6'])
  })

  describe('the recommendation', () => {
    // The CLI's own ranking wins wherever it exists. It is the only ordering
    // that can speak for models this app has never measured, and using the
    // app's list instead would be inventing an opinion over the vendor's.
    it('follows the CLI own ranking when the CLI publishes one', () => {
      const groups = buildModelGroups({
        available: CLI_PROVIDERS,
        baseline: [],
        recommended: RECOMMENDED,
        discovered: [
          { provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: 7 },
          { provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: 2 },
          { provider: 'codex', modelId: 'gpt-5.4-mini', origin: 'catalog', rank: 23 }
        ]
      })

      expect(groups[0]?.options.find((option) => option.recommended)?.modelId).toBe('gpt-5.6-terra')
    })

    it('orders a ranked group the way its CLI ranked it', () => {
      const groups = buildModelGroups({
        available: CLI_PROVIDERS,
        baseline: [],
        recommended: RECOMMENDED,
        discovered: [
          { provider: 'codex', modelId: 'gpt-5.4-mini', origin: 'catalog', rank: 23 },
          { provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: 2 },
          { provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: 7 }
        ]
      })

      expect(groups[0]?.options.map((option) => option.modelId)).toEqual(['gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4-mini'])
    })

    // Claude publishes no ranking, so its group falls back to what the app
    // actually measured.
    it('falls back to the measured order for a CLI that publishes no ranking', () => {
      expect(
        build()
          .flatMap((g) => g.options)
          .find((option) => option.recommended)?.modelId
      ).toBe('claude-sonnet-5')
    })

    it('falls through to the next measured model when the first is not available', () => {
      const groups = buildModelGroups({
        available: CLI_PROVIDERS,
        baseline: [{ provider: 'claude', modelId: 'claude-opus-5' }],
        recommended: RECOMMENDED,
        discovered: []
      })

      expect(groups[0]?.options.find((option) => option.recommended)?.modelId).toBe('claude-opus-5')
    })

    // Each CLI recommends within its OWN section: a Claude model cannot be
    // "better" than a Codex one, they spend different accounts entirely.
    it('recommends one model per CLI, not one overall', () => {
      const groups = buildModelGroups({
        available: CLI_PROVIDERS,
        baseline: BASELINE,
        recommended: RECOMMENDED,
        discovered: [{ provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: 2 }]
      })

      expect(groups.map((group) => group.options.filter((option) => option.recommended).map((o) => o.modelId))).toEqual(
        [['claude-sonnet-5'], ['gpt-5.6-terra']]
      )
    })

    // Recommending nothing is honest. Recommending a model with neither a
    // vendor ranking nor a measurement would be the app making it up.
    it('recommends nothing in a group that is neither ranked nor known', () => {
      const groups = buildModelGroups({
        available: CLI_PROVIDERS,
        baseline: [],
        recommended: RECOMMENDED,
        discovered: [{ provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: null }]
      })

      expect(groups[0]?.options.some((option) => option.recommended)).toBe(false)
    })

    it('ignores a measured priority id that is nowhere in the list', () => {
      const groups = build([], ['claude-nonexistent-9', 'claude-opus-5'])

      expect(groups[0]?.options.find((option) => option.recommended)?.modelId).toBe('claude-opus-5')
    })
  })
})

// The picker is bounded by PERMISSION, not by preference. The app cannot spawn
// a CLI the student has not connected — main refuses it at the process
// boundary — so a menu still listing its models would be offering rows that
// answer nothing.
describe('buildModelGroups — only available CLIs', () => {
  const withConnected = (connected: readonly ('claude' | 'antigravity' | 'codex')[]) =>
    buildModelGroups({
      baseline: ASK_BASELINE_MODELS,
      recommended: ASK_RECOMMENDED_MODELS,
      discovered: [],
      available: connected
    })

  it('offers nothing at all when no CLI is connected', () => {
    expect(withConnected([])).toEqual([])
  })

  // The baseline exists to keep the picker usable with zero DISCOVERIES, never
  // to advertise a CLI the student does not have.
  it('drops a CLI the baseline would otherwise have filled a section for', () => {
    expect(withConnected(['claude']).map((group) => group.provider)).toEqual(['claude'])
  })

  // Antigravity rather than Codex, because the baseline covers it: being
  // connected is what ADMITS a CLI to the menu, but having something to offer
  // is still what fills a section. Codex reaches the picker only through
  // discovery, and asserting it here would be testing the baseline table
  // rather than the permission filter.
  it('offers a section for each connected CLI that has models', () => {
    expect(withConnected(['claude', 'antigravity']).map((group) => group.provider)).toEqual(['claude', 'antigravity'])
  })

  // Menu order is the app's, so connecting a second CLI slots it into the place
  // it would always have had rather than appending it where it was connected.
  it('keeps menu order regardless of the order the CLIs were connected in', () => {
    expect(withConnected(['antigravity', 'claude']).map((group) => group.provider)).toEqual(['claude', 'antigravity'])
  })

  it('drops a discovered model whose CLI is not connected', () => {
    const groups = buildModelGroups({
      baseline: [],
      recommended: [],
      discovered: [{ provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: 1 }],
      available: ['claude']
    })

    expect(groups).toEqual([])
  })
})

// Being opted in is not the same as being usable. A CLI can be connected and
// missing from the machine — that is exactly the state a student lands in after
// pointing the app at an executable that later moved.
describe('buildModelGroups — an opted-in CLI that does not work', () => {
  it('offers no section for it', () => {
    const groups = buildModelGroups({
      baseline: ASK_BASELINE_MODELS,
      recommended: ASK_RECOMMENDED_MODELS,
      discovered: [],
      // Antigravity is connected but not found, so the caller leaves it out.
      available: ['claude']
    })

    expect(groups.map((group) => group.provider)).toEqual(['claude'])
  })
})
