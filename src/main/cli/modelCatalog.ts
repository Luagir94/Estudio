import { readFile as fsReadFile } from 'node:fs/promises'
import { homedir as osHomedir } from 'node:os'
import path from 'node:path'
import log from 'electron-log'
import { modelIdSchema, type DiscoveredModel } from '../../shared/ipc/cli'

// Discovers which models the installed CLI can actually be asked for, instead
// of offering a list this app's authors hardcoded.
//
// It has to work this way because the CLI CANNOT BE ASKED. Verified against
// the installed binary (`claude` 2.1.220): there is no `models` subcommand —
// `claude --help` lists agents, auth, auto-mode, doctor, gateway, install,
// mcp, plugin, project, setup-token, ultrareview and update, and nothing else.
// Typing `claude models` does not query anything; it is read as a PROMPT and
// starts a session, which spends the student's own usage to produce a table
// that only looks like an answer. `codex` is the same. So the one honest
// automatic source left is the state the CLI keeps for itself.
//
// That state is `~/.claude.json`, and two of its keys are real evidence:
//
//   `additionalModelOptionsCache` — what the SERVER told the CLI this account
//   may use beyond the defaults, cached verbatim. This is the closest thing to
//   an account model list that exists on disk.
//
//   `projects.<dir>.lastModelUsage` — keyed by the model ids this account has
//   ALREADY RUN, with their token counts. A model that answered is proof of
//   access in a way no documentation is.
//
// Neither is a documented contract. This module therefore treats the whole
// file as HOSTILE INPUT: every shape is checked, every id must pass the same
// `modelIdSchema` the spawn boundary enforces, and every failure — missing
// file, locked file, garbage contents, drifted schema — answers an empty list.
// Empty is not a degraded state here: the picker keeps its curated models and
// its free-text field, which is exactly where it stood before this module
// existed. Discovery can only ever ADD.
//
// Codex keeps a BETTER version of the same thing at `~/.codex/models_cache.json`:
// a list its CLI fetched from the server, stamped with `fetched_at`, an `etag`
// and the client version that asked for it. It also states a `visibility` per
// model, which is the vendor saying out loud which ones a person may pick —
// `codex-auto-review` is marked `hide` because it is internal. Honouring that
// flag is the difference between reading a file and understanding it.
//
// Codex has no `models` subcommand either: `codex --help` lists exec, review,
// login, mcp, plugin, doctor and the rest, and none of them enumerates models.
// Typing `codex models` opens the TUI, exactly as `claude models` starts a
// session. Same problem, same answer.
//
// Each CLI is read INDEPENDENTLY. Having one installed and not the other is
// the ordinary case, so a missing file on one side must never cost the user
// the models found on the other.
//
// Nothing here spawns. Reading a file the CLI already wrote costs no tokens,
// no network and no account, which is the whole reason this is the source and
// a probe question is not.

/** Each CLI's own per-user state file, relative to the home directory. */
const CLAUDE_STATE_FILE = ['.claude.json']
const CODEX_STATE_FILE = ['.codex', 'models_cache.json']

export interface ModelCatalogDeps {
  /** Reads the state file as UTF-8. Rejecting is ordinary, not exceptional. */
  readFile?: (filePath: string) => Promise<string>
  homedir?: () => string
  logger?: Pick<typeof log, 'info'>
}

export interface ModelCatalog {
  /** Never rejects and never throws — an unreadable file answers `[]`. */
  discover(): Promise<DiscoveredModel[]>
}

/** Narrows `unknown` to something with string keys, without asserting a shape. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Parses the CLI state file into discovered models.
 *
 * Exported separately from the reader so the parsing rules — which are the
 * risky half — are testable against real captured file shapes without a
 * filesystem.
 *
 * Order is EVIDENCE ORDER: server-granted options first, then models the
 * account has run. The picker renders it as given.
 */
export function parseClaudeModelState(raw: string): DiscoveredModel[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const state = asRecord(parsed)
  if (state === null) return []

  const discovered: DiscoveredModel[] = []
  const seen = new Set<string>()

  const add = (candidate: unknown, origin: DiscoveredModel['origin']): void => {
    if (typeof candidate !== 'string') return
    // The SAME gate the spawn boundary uses. An id this rejects would be
    // offered and then refused, so it is dropped where nobody can click it.
    const validated = modelIdSchema.safeParse(candidate)
    if (!validated.success || seen.has(validated.data)) return
    seen.add(validated.data)
    // `rank: null` is a statement, not a placeholder: Claude publishes no
    // ordering of its own anywhere in this file, so the app must not pretend
    // to have read one.
    discovered.push({ provider: 'claude', modelId: validated.data, origin, rank: null })
  }

  const options = state.additionalModelOptionsCache
  if (Array.isArray(options)) {
    for (const option of options) {
      add(asRecord(option)?.value, 'catalog')
    }
  }

  const projects = asRecord(state.projects)
  if (projects !== null) {
    for (const project of Object.values(projects)) {
      const usage = asRecord(asRecord(project)?.lastModelUsage)
      if (usage === null) continue
      for (const modelId of Object.keys(usage)) {
        add(modelId, 'used')
      }
    }
  }

  return discovered
}

/**
 * Parses Codex's server-fetched model cache.
 *
 * `visibility` is honoured rather than ignored: a value that is explicitly
 * something other than `list` is the CLI stating this model is not for
 * picking, and offering it anyway would put a model in front of the student
 * that its own vendor keeps out of its own menu.
 *
 * An ABSENT visibility is treated as listable on purpose. If a future Codex
 * renames or drops that field, the honest degradation is offering everything
 * the file names — not silently emptying a picker that worked yesterday.
 */
export function parseCodexModelState(raw: string): DiscoveredModel[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const models = asRecord(parsed)?.models
  if (!Array.isArray(models)) return []

  const discovered: DiscoveredModel[] = []
  const seen = new Set<string>()

  for (const model of models) {
    const entry = asRecord(model)
    if (entry === null) continue

    const visibility = entry.visibility
    if (typeof visibility === 'string' && visibility !== 'list') continue

    if (typeof entry.slug !== 'string') continue
    // The same gate the spawn boundary uses, for the same reason as above.
    const validated = modelIdSchema.safeParse(entry.slug)
    if (!validated.success || seen.has(validated.data)) continue

    seen.add(validated.data)
    // The vendor's own ranking, carried verbatim. Anything that is not a
    // number is not a priority, however confidently the file states it.
    const rank = typeof entry.priority === 'number' && Number.isInteger(entry.priority) ? entry.priority : null
    discovered.push({ provider: 'codex', modelId: validated.data, origin: 'catalog', rank })
  }

  return discovered
}

export function createModelCatalog({
  readFile = (filePath) => fsReadFile(filePath, 'utf8'),
  homedir = osHomedir,
  logger = log
}: ModelCatalogDeps = {}): ModelCatalog {
  /**
   * Reads one CLI's state file and parses it. Answers `[]` for every failure
   * — absent, locked, unreadable, or a machine where that CLI has never run —
   * because none of those is a problem the student caused or can act on.
   */
  async function readProvider(
    segments: readonly string[],
    parse: (raw: string) => DiscoveredModel[]
  ): Promise<DiscoveredModel[]> {
    const filePath = path.join(homedir(), ...segments)

    try {
      return parse(await readFile(filePath))
    } catch {
      return []
    }
  }

  return {
    async discover(): Promise<DiscoveredModel[]> {
      // Read together rather than in sequence: neither answer depends on the
      // other, and one CLI being absent must not delay the one that is there.
      const perProvider = await Promise.all([
        readProvider(CLAUDE_STATE_FILE, parseClaudeModelState),
        readProvider(CODEX_STATE_FILE, parseCodexModelState)
      ])

      const discovered = perProvider.flat()
      logger.info(`model catalog: discovered ${discovered.length} model id(s) across the installed CLIs`)
      return discovered
    }
  }
}
