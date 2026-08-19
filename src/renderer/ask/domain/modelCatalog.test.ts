import { describe, expect, it } from 'vitest'
import type { DiscoveredModel } from '../../../shared/ipc/cli'
import { buildModelGroups, humanizeModelId } from './modelCatalog'

const BASELINE = [
  { provider: 'claude' as const, modelId: 'claude-sonnet-5' },
  { provider: 'claude' as const, modelId: 'claude-opus-5' }
]
const KNOWLEDGE = {
  'claude-sonnet-5': 'Equilibrado',
  'claude-opus-5': 'El más capaz · consume mucho más de tu límite'
}
const RECOMMENDED = ['claude-sonnet-5', 'claude-opus-5']

const build = (discovered: DiscoveredModel[] = [], recommended = RECOMMENDED) =>
  buildModelGroups({ baseline: BASELINE, knowledge: KNOWLEDGE, recommended, discovered })

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

  it('names every option from its id and describes only the ones it knows', () => {
    const options = flatten([{ provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: null }])

    expect(options).toContainEqual({
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      name: 'Sonnet 5',
      detail: 'Equilibrado',
      recommended: true
    })
    // Nothing measured about it, so nothing claimed about it.
    expect(options).toContainEqual({
      provider: 'codex',
      modelId: 'gpt-5.6-terra',
      name: 'GPT 5.6 Terra',
      detail: '',
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

  describe('the recommendation', () => {
    // The CLI's own ranking wins wherever it exists. It is the only ordering
    // that can speak for models this app has never measured, and using the
    // app's list instead would be inventing an opinion over the vendor's.
    it('follows the CLI own ranking when the CLI publishes one', () => {
      const groups = buildModelGroups({
        baseline: [],
        knowledge: KNOWLEDGE,
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
        baseline: [],
        knowledge: KNOWLEDGE,
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
        baseline: [{ provider: 'claude', modelId: 'claude-opus-5' }],
        knowledge: KNOWLEDGE,
        recommended: RECOMMENDED,
        discovered: []
      })

      expect(groups[0]?.options.find((option) => option.recommended)?.modelId).toBe('claude-opus-5')
    })

    // Each CLI recommends within its OWN section: a Claude model cannot be
    // "better" than a Codex one, they spend different accounts entirely.
    it('recommends one model per CLI, not one overall', () => {
      const groups = buildModelGroups({
        baseline: BASELINE,
        knowledge: KNOWLEDGE,
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
        baseline: [],
        knowledge: KNOWLEDGE,
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
