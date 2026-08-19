import { describe, expect, it, vi } from 'vitest'
import { createModelCatalog, parseClaudeModelState, parseCodexModelState } from './modelCatalog'

// A trimmed copy of the real `~/.claude.json` shape, taken from an installed
// CLI rather than invented: the bracketed context-window ids and the
// per-project `lastModelUsage` map are exactly what that file holds.
const REAL_SHAPE = JSON.stringify({
  additionalModelOptionsCache: [{ value: 'claude-fable-5[1m]', label: 'Fable', description: 'Fable 5 · Most capable' }],
  modelAccessCache: [],
  orgModelDefaultCache: null,
  projects: {
    'C:/Users/testuser': {
      lastModelUsage: {
        'claude-opus-5[1m]': { costUSD: 0.4 },
        'claude-haiku-4-5-20251001': { costUSD: 0.0006 }
      }
    },
    'C:/Users/testuser/Projects/study': {
      lastModelUsage: { 'claude-sonnet-5': { costUSD: 0.017 } }
    }
  }
})

describe('parseClaudeModelState', () => {
  it('discovers the account-granted options the CLI cached', () => {
    expect(parseClaudeModelState(REAL_SHAPE)).toContainEqual({
      provider: 'claude',
      modelId: 'claude-fable-5[1m]',
      origin: 'catalog',
      rank: null
    })
  })

  it('discovers every model the account has actually run, across all projects', () => {
    const found = parseClaudeModelState(REAL_SHAPE).filter((entry) => entry.origin === 'used')

    expect(found.map((entry) => entry.modelId)).toEqual([
      'claude-opus-5[1m]',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5'
    ])
  })

  // Claude publishes no ordering: `orgModelDefaultCache` is null and
  // `modelAccessCache` is empty, so its models arrive unranked on purpose.
  it('reports no rank for Claude, which publishes none', () => {
    expect(parseClaudeModelState(REAL_SHAPE).every((entry) => entry.rank === null)).toBe(true)
  })

  it('lists the granted options before the merely-used ones', () => {
    expect(parseClaudeModelState(REAL_SHAPE)[0]?.origin).toBe('catalog')
  })

  // The same id appears in several projects' usage maps. Offering it three
  // times would be the picker reporting the file's shape, not the account's.
  it('reports each model once', () => {
    const twice = JSON.stringify({
      projects: {
        a: { lastModelUsage: { 'claude-sonnet-5': {} } },
        b: { lastModelUsage: { 'claude-sonnet-5': {} } }
      }
    })

    expect(parseClaudeModelState(twice)).toHaveLength(1)
  })

  // This file belongs to another program. Nothing in it is a promise, so an
  // id that would not survive the spawn boundary is dropped HERE — offering a
  // model the app then refuses to run is worse than not offering it.
  it.each([
    ['a quote', 'claude"5'],
    ['a space', 'claude sonnet'],
    ['an ampersand', 'claude&whoami'],
    ['a leading hyphen', '--dangerously-skip-permissions'],
    ['an unenumerated suffix', 'claude-opus-5[beta]'],
    ['an empty id', '']
  ])('drops %s rather than offering it', (_label, hostileId) => {
    const hostile = JSON.stringify({ projects: { a: { lastModelUsage: { [hostileId]: {} } } } })

    expect(parseClaudeModelState(hostile)).toEqual([])
  })

  it.each([
    ['unparseable text', 'not json at all'],
    ['a JSON array', '[]'],
    ['an empty object', '{}'],
    ['null caches', JSON.stringify({ additionalModelOptionsCache: null, projects: null })],
    ['wrongly-typed caches', JSON.stringify({ additionalModelOptionsCache: 'nope', projects: 7 })],
    ['entries without a value', JSON.stringify({ additionalModelOptionsCache: [{ label: 'Fable' }] })]
  ])('answers empty for %s instead of throwing', (_label, raw) => {
    expect(parseClaudeModelState(raw)).toEqual([])
  })
})

// The shape of the real `~/.codex/models_cache.json`, which is a stronger
// source than Claude's: the CLI fetches this list from the server and stamps it
// with `fetched_at`, an `etag` and the client version that asked.
const CODEX_SHAPE = JSON.stringify({
  fetched_at: '2026-08-19T20:24:19Z',
  client_version: '0.148.0',
  models: [
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', visibility: 'list', priority: 2 },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 7 },
    // The CLI's own word that this one is not user-pickable.
    { slug: 'codex-auto-review', display_name: 'Auto review', visibility: 'hide', priority: 43 }
  ]
})

describe('parseCodexModelState', () => {
  it('discovers the models the CLI cached from the server', () => {
    expect(parseCodexModelState(CODEX_SHAPE)).toEqual([
      { provider: 'codex', modelId: 'gpt-5.6-terra', origin: 'catalog', rank: 2 },
      { provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: 7 }
    ])
  })

  // `visibility: 'hide'` is the CLI saying this model is internal. Offering it
  // would put a model in the picker that its own vendor keeps out of one.
  it('respects the visibility the CLI recorded', () => {
    expect(parseCodexModelState(CODEX_SHAPE).map((entry) => entry.modelId)).not.toContain('codex-auto-review')
  })

  // A field this app does not understand must not silently empty the list: a
  // renamed or dropped `visibility` degrades to offering everything, never to
  // offering nothing.
  it('keeps a model whose visibility the file does not state', () => {
    const noVisibility = JSON.stringify({ models: [{ slug: 'gpt-5.5' }] })

    expect(parseCodexModelState(noVisibility)).toEqual([
      { provider: 'codex', modelId: 'gpt-5.5', origin: 'catalog', rank: null }
    ])
  })

  it('drops a slug the shared contract would refuse', () => {
    const hostile = JSON.stringify({ models: [{ slug: 'gpt 5.5', visibility: 'list' }] })

    expect(parseCodexModelState(hostile)).toEqual([])
  })

  it.each([
    ['unparseable text', 'not json at all'],
    ['a missing models key', '{}'],
    ['a wrongly-typed models key', JSON.stringify({ models: 'nope' })],
    ['entries without a slug', JSON.stringify({ models: [{ display_name: 'GPT-5.5' }] })]
  ])('answers empty for %s instead of throwing', (_label, raw) => {
    expect(parseCodexModelState(raw)).toEqual([])
  })
})

// The vendor's own ranking is the only thing that can order models this app
// has never measured, so it is carried rather than discarded.
it('carries the priority the CLI published for each model', () => {
  const ranks = parseCodexModelState(CODEX_SHAPE).map((entry) => entry.rank)

  expect(ranks).toEqual([2, 7])
})

it('reports a null rank when the file states no priority', () => {
  const noPriority = JSON.stringify({ models: [{ slug: 'gpt-5.5', visibility: 'list' }] })

  expect(parseCodexModelState(noPriority)[0]?.rank).toBeNull()
})

// A priority that is not a number is not a priority.
it('ignores a non-numeric priority instead of trusting it', () => {
  const odd = JSON.stringify({ models: [{ slug: 'gpt-5.5', visibility: 'list', priority: 'first' }] })

  expect(parseCodexModelState(odd)[0]?.rank).toBeNull()
})

describe('createModelCatalog', () => {
  const stateFor = (filePath: string): string =>
    filePath.includes('.codex') ? CODEX_SHAPE : filePath.includes('.claude.json') ? REAL_SHAPE : '{}'

  it('reads the state file of every supported CLI', async () => {
    const readFile = vi.fn(async (filePath: string) => stateFor(filePath))
    const catalog = createModelCatalog({ readFile, homedir: () => '/home/testuser' })

    await catalog.discover()

    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('.claude.json'))
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('models_cache.json'))
  })

  it('answers the models of both CLIs together', async () => {
    const catalog = createModelCatalog({
      readFile: vi.fn(async (filePath: string) => stateFor(filePath)),
      homedir: () => '/home/testuser'
    })

    const providers = (await catalog.discover()).map((entry) => entry.provider)

    expect(new Set(providers)).toEqual(new Set(['claude', 'codex']))
  })

  // One CLI installed is the ordinary case. The other one's missing file must
  // not cost the user the models that were found.
  it('keeps one CLI models when the other state file is unreadable', async () => {
    const catalog = createModelCatalog({
      readFile: vi.fn(async (filePath: string) => {
        if (filePath.includes('.codex')) throw new Error('ENOENT')
        return REAL_SHAPE
      }),
      homedir: () => '/home/testuser'
    })

    const discovered = await catalog.discover()

    expect(discovered.length).toBeGreaterThan(0)
    expect(discovered.every((entry) => entry.provider === 'claude')).toBe(true)
  })

  // The file is another program's private state: absent, unreadable or
  // locked are all ORDINARY. The picker keeps its curated list and the panel
  // never learns anything went wrong.
  it('answers empty when no state file can be read', async () => {
    const catalog = createModelCatalog({
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      homedir: () => '/home/testuser'
    })

    await expect(catalog.discover()).resolves.toEqual([])
  })
})
