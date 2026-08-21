import { CLI_PROVIDERS, type CliProvider, type DiscoveredModel, type ModelSelection } from '../../../shared/ipc/cli'
import { ASK_PROVIDER_LABEL, type AskModelOption } from './askDisplay'

// Builds the model menu: what to offer, how to name it, and which one to
// recommend.
//
// The shape of this module is the design decision worth stating. The app used
// to hold a LIST OF MODELS TO OFFER. It now holds three smaller things that
// answer three different questions:
//
//   the BASELINE — what must always be offerable, so the panel works on a
//   machine where nothing has been discovered yet;
//   the KNOWLEDGE — what the app has actually measured, keyed by model id, so
//   a description attaches to a model when that model is present and stays
//   silent when it is not;
//   the PRIORITY — which model to recommend, resolved against what is
//   available rather than declared in advance.
//
// That split is what makes "recomendado" honest. A recommendation is a claim
// about a choice the student can make right now; pinned to a fixed list, it
// could point at a model their CLI does not have.
//
// Names are DERIVED from ids, never looked up. The app cannot know every model
// in advance — that is the whole reason discovery exists — so a name table
// would put us one release behind the account again.
//
// No string from a CLI's own state file reaches this module. Main sends ids;
// every user-facing word here is the app's own, in the app's language, exactly
// as `describeAskError` insists for errors.

const CONTEXT_SUFFIX = /\[([0-9]{1,4})([kKmM])\]$/
/** A build date stamp, e.g. the `20251001` in `claude-haiku-4-5-20251001`. */
const DATE_STAMP = /^[0-9]{8}$/
/** An all-letters token with no vowel is an acronym, not a word: `gpt`, not `Gpt`. */
const ACRONYM = /^[a-z]+$/
const VOWEL = /[aeiou]/

/**
 * Title-cases a word, except that a vendor acronym is UPPERCASED.
 *
 * "Gpt 5.6 Terra" is not a shabbier rendering of the name — it is the wrong
 * name, on the row a student is about to spend their own quota from. The vowel
 * test is a small rule doing exactly one job: `gpt` and `o3` are acronyms,
 * `sonnet`, `opus`, `fable`, `terra`, `luna` and `mini` are words.
 */
function nameToken(word: string): string {
  if (ACRONYM.test(word) && !VOWEL.test(word)) return word.toUpperCase()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * A display name derived from the id itself.
 *
 * The context-window marker is kept while the build date stamp is dropped, and
 * that asymmetry is deliberate: `claude-opus-5[1m]` and `claude-opus-5` are
 * genuinely different choices a student makes, whereas the date is a build
 * identifier nobody picks by. Two rows both reading "Opus 5" would be the
 * picker lying about which one is which.
 */
export function humanizeModelId(modelId: string): string {
  const context = CONTEXT_SUFFIX.exec(modelId)
  const bare = modelId.replace(CONTEXT_SUFFIX, '')

  const tokens = bare
    .split('-')
    .filter((token) => token.length > 0)
    .filter((token) => !DATE_STAMP.test(token))

  // The vendor prefix is noise in a list already grouped by CLI, and it is
  // what makes `claude-opus-5` read as "Opus 5" under a "Claude Code" heading
  // rather than "Claude Opus 5".
  if (tokens[0] === 'claude' && tokens.length > 1) tokens.shift()

  // Version parts belong to the word before them: `haiku 4 5` is a version
  // number split by the id's own separator, not three names.
  const parts: string[] = []
  for (const token of tokens) {
    const isNumeric = /^[0-9]+$/.test(token)
    const previous = parts[parts.length - 1]
    if (isNumeric && previous !== undefined && /^[0-9]+(\.[0-9]+)*$/.test(previous)) {
      parts[parts.length - 1] = `${previous}.${token}`
      continue
    }
    parts.push(isNumeric ? token : nameToken(token))
  }

  const name = parts.join(' ')
  return context === null ? name : `${name} · ${context[1]}${context[2].toUpperCase()}`
}

/** One CLI's section of the menu. A CLI with nothing to offer produces no group at all. */
export interface ModelGroup {
  provider: CliProvider
  /** The heading. App-owned copy, never a label read out of the CLI. */
  label: string
  options: AskModelOption[]
}

export interface BuildModelGroupsInput {
  /** Always offerable, in menu order — the floor that keeps the panel usable with zero discoveries. */
  baseline: readonly ModelSelection[]
  /** Model id → what the app has measured about it. Absent means the app says nothing. */
  knowledge: Readonly<Record<string, string>>
  /** Model ids in recommendation priority. The first one AVAILABLE wins; none is a valid answer. */
  recommended: readonly string[]
  discovered: readonly DiscoveredModel[]
  /**
   * The CLIs that are BOTH connected and known to work. A provider absent from
   * this list gets NO section, however many models the baseline would have
   * offered for it.
   *
   * Availability, not permission — and the difference is not academic. A CLI
   * can be opted in and missing from the machine, and a menu filtered only by
   * the opt-in would offer its models anyway: rows that spend a click to reach
   * a CLI that answers nothing. The baseline exists to keep the picker usable
   * with zero DISCOVERIES, never to advertise a CLI that is not there.
   */
  available: readonly CliProvider[]
}

/** A model plus the ordering its own CLI gave it, if any. */
interface RankedModel extends ModelSelection {
  rank: number | null
}

/** The baseline is the app's own floor, so it carries no vendor ranking by definition. */
const withoutRank = (entry: ModelSelection): RankedModel => ({ ...entry, rank: null })

const identityOf = (entry: { provider: string; modelId: string }): string => `${entry.provider}:${entry.modelId}`

export function buildModelGroups({
  baseline,
  knowledge,
  recommended,
  discovered,
  available
}: BuildModelGroupsInput): ModelGroup[] {
  // Baseline first so a model the app has measured keeps its place above the
  // ones it merely found, then everything discovered that is genuinely new.
  const seen = new Set<string>()
  const all: RankedModel[] = []
  for (const entry of [...baseline.map(withoutRank), ...discovered]) {
    const identity = identityOf(entry)
    if (seen.has(identity)) continue
    seen.add(identity)
    all.push({ provider: entry.provider, modelId: entry.modelId, rank: entry.rank })
  }

  // Menu order stays `CLI_PROVIDERS`, so connecting a second CLI slots it into
  // the same place it would always have had rather than appending it wherever
  // the student happened to connect it.
  return CLI_PROVIDERS.filter((provider) => available.includes(provider))
    .map((provider) => {
      const members = order(all.filter((entry) => entry.provider === provider))
      const winner = recommend(members, recommended)

      return {
        provider,
        label: ASK_PROVIDER_LABEL[provider],
        options: members.map((entry) => ({
          provider,
          modelId: entry.modelId,
          name: humanizeModelId(entry.modelId),
          detail: knowledge[entry.modelId] ?? '',
          recommended: entry.modelId === winner
        }))
      }
    })
    .filter((group) => group.options.length > 0)
}

/**
 * Sorts a CLI's models the way that CLI ranked them, and leaves them alone
 * when it published no ranking.
 *
 * The unranked branch is not a degraded case: it is the Claude group keeping
 * the order the app chose from its own measurements, which is the best
 * ordering that exists when the vendor states none.
 */
function order(members: readonly RankedModel[]): RankedModel[] {
  if (!members.some((entry) => entry.rank !== null)) return [...members]
  return [...members].sort((left, right) => (left.rank ?? Infinity) - (right.rank ?? Infinity))
}

/**
 * Picks the one model to badge inside a single CLI's section — or none.
 *
 * Per CLI, never overall: a Claude model cannot be "better" than a Codex one,
 * they spend different accounts entirely, and a single badge across both would
 * be comparing things that do not compare.
 *
 * The VENDOR'S ranking wins wherever it exists. It is the only ordering that
 * can speak for a model this app has never run, and preferring the app's own
 * list over it would be inventing an opinion on top of the one the CLI already
 * published. The measured order is the fallback for a CLI that publishes
 * nothing — today, Claude.
 *
 * `null` is a real answer. A group with neither a vendor ranking nor a single
 * measured model gets no badge, because the app has nothing to base one on.
 */
function recommend(members: readonly RankedModel[], measured: readonly string[]): string | null {
  const ranked = members.filter((entry) => entry.rank !== null)
  if (ranked.length > 0) {
    return ranked.reduce((best, entry) => ((entry.rank as number) < (best.rank as number) ? entry : best)).modelId
  }

  return measured.find((modelId) => members.some((entry) => entry.modelId === modelId)) ?? null
}
