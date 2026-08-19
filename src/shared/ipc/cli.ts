// Shared contract for MULTI-PROVIDER CLI integration (`cli:*` channels and
// the provider/model half of `ask:question`). Parsed on BOTH sides, matching
// the two-sided-parsing convention (`src/shared/ipc/materias.ts`).
//
// This module exists because the app no longer talks to one CLI. It talks to
// whichever of three the student has installed, and each one has a different
// argv vocabulary, a different JSON envelope, and a different answer to "can
// you keep a process alive between questions". What they SHARE is exactly
// what lives here: an identity, an executable override, and a model id.
import { z } from 'zod'
import { ipcErr, ipcOk, type IpcResult } from './materias'

export { ipcErr, ipcOk, type IpcResult }

// --- provider identity ------------------------------------------------------

// A CLOSED set, and it must stay closed: the provider key selects an argv
// template from a static table inside the spawn boundary. An open string here
// would mean a payload could name a template that does not exist, or worse,
// one chosen by something other than this app.
export const cliProviderSchema = z.enum(['claude', 'gemini', 'codex'])

export type CliProvider = z.infer<typeof cliProviderSchema>

/**
 * The providers the app actually offers — menu order, and the order the
 * settings screen probes them in.
 *
 * Gemini is deliberately absent. Its argv template was never run against a real
 * binary, and unlike the other two it has no tool allowlist at all: containment
 * would rest on there being nobody present to approve an action rather than on
 * anything stated at the spawn boundary. Its spec and its research are kept in
 * `providerSpec.ts` so re-enabling it is this one line plus a verification
 * pass, not a rewrite.
 */
export const CLI_PROVIDERS: readonly CliProvider[] = ['claude', 'codex']

export function isProviderEnabled(provider: CliProvider): boolean {
  return CLI_PROVIDERS.includes(provider)
}

/**
 * The WRITE-side provider gate. Deliberately narrower than
 * `cliProviderSchema`: a disabled provider must not cross the bridge in a
 * question or an override, while the wide enum stays available for READ-side
 * shapes so a status or a persisted row naming it still parses instead of
 * throwing.
 */
export const enabledCliProviderSchema = cliProviderSchema.refine(isProviderEnabled, {
  message: 'this CLI is not enabled in this build'
})

// --- model id ---------------------------------------------------------------

/**
 * The model-id gate — the single most safety-critical regex in the app.
 *
 * The previous design used an opaque three-key enum (`sonnet`/`opus`/`haiku`)
 * resolved to a literal inside the spawn boundary, because the resolved
 * string reaches the `cmd.exe` command line on the Windows shim branch. That
 * enum is gone: no CLI of the three can enumerate the models an account
 * actually has (verified — `claude` has no `models` subcommand, and neither
 * `gemini` nor `codex` documents one), so a fixed table could only ever
 * describe what the app's authors happened to know on the day they wrote it.
 *
 * What replaces it is this ALLOWLIST OF CHARACTERS. It is a whitelist, never
 * a blacklist: every character that could break out of the cmd.exe vector or
 * confuse a shell — `"`, `%`, newline, space, `&`, `|`, `<`, `>`, `^`, `(`,
 * `)`, backtick — is excluded by CONSTRUCTION rather than by being listed as
 * forbidden. A blacklist here would be a standing invitation to miss one.
 *
 * The leading `[A-Za-z0-9]` is not cosmetic: it stops an id beginning with
 * `-`, which the CLI would read as another flag rather than as a model name.
 * The 64-character ceiling keeps a pathological id out of the command line.
 *
 * Every real id of all three providers fits: `sonnet`, `claude-opus-5`,
 * `gemini-2.5-pro`, `gpt-5-codex`, `o3`.
 *
 * The trailing `(\[…\])?` group is the one concession, and it is a CLOSED
 * SHAPE rather than a widening of the character class. Anthropic distinguishes
 * a long-context variant of a model by suffixing its id — `claude-opus-5[1m]`,
 * `claude-fable-5[1m]` — and those are not hypothetical: they are the exact ids
 * the CLI writes into its own state file, so the model catalog discovers them.
 * A gate that rejected them would let the picker offer a model the spawn
 * boundary then refuses, which is the one failure mode worse than not offering
 * it at all.
 *
 * Brackets stay excluded EVERYWHERE else. They may appear only as a trailing
 * digits-plus-`k`/`m` marker, so the whitelist spirit holds: this admits one
 * enumerated form, not a new character. Both are inert in the `cmd.exe` vector
 * — unlike `&`, `|`, `^`, `%`, `(` or `)`, square brackets carry no meaning to
 * cmd.exe and none to POSIX argv, which is spawned with `shell: false`.
 */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(\[[0-9]{1,4}[kKmM]\])?$/

export const modelIdSchema = z
  .string()
  .trim()
  .regex(
    MODEL_ID_PATTERN,
    'a model id may only contain letters, digits, dot, underscore and hyphen, with an optional context-window suffix such as [1m]'
  )

export type ModelId = z.infer<typeof modelIdSchema>

/** Provider + model together — neither is meaningful without the other. */
export const modelSelectionSchema = z.object({
  provider: enabledCliProviderSchema,
  modelId: modelIdSchema
})

export type ModelSelection = z.infer<typeof modelSelectionSchema>

// --- provider status --------------------------------------------------------

// Same three-state classification the single-provider probe already used
// (spec "Three-State Status Classification"), now carried per provider. The
// renderer still never sees a raw exit code or spawn error.
export const cliProviderStatusSchema = z.object({
  provider: cliProviderSchema,
  status: z.enum(['connected', 'not-found', 'unusable']),
  version: z.string().nullable(),
  resolvedPath: z.string().nullable(),
  source: z.enum(['auto', 'override']),
  overridePath: z.string().nullable(),
  detail: z.string().nullable(),
  /**
   * What the INSTALLED binary was observed to support, rather than what its
   * documentation claims. Null until a capability probe has run.
   *
   * This field is the app's answer to a problem it cannot solve at authoring
   * time: Gemini's own docs describe an `--output-format` flag that shipped
   * versions reject (google-gemini/gemini-cli#9009). A template written from
   * documentation is a guess, and this app does not spawn guesses — it probes
   * the binary in front of it and records what actually answered.
   */
  capabilities: z
    .object({
      /** `--output-format json` (or the provider's equivalent) was accepted. */
      structuredOutput: z.boolean(),
      /** A duplex stream-json stdin exists, so one process can serve many questions. */
      warmSession: z.boolean(),
      /** Tool access can be restricted to a read-only set at the spawn boundary. */
      readOnlyTools: z.boolean()
    })
    .nullable()
})

export type CliProviderStatus = z.infer<typeof cliProviderStatusSchema>

export const cliStatusResultSchema = z.array(cliProviderStatusSchema)

export type CliStatusResult = z.infer<typeof cliStatusResultSchema>

// --- cli:setOverride --------------------------------------------------------

// `null` clears the override for that provider and resumes autodetection.
// Validation gates the SPAWN, not the save, so this only enforces shape.
export const setCliOverrideInputSchema = z.object({
  provider: enabledCliProviderSchema,
  // Length bound only — the SPAWN gate (claudeExecutableValidator) is what
  // actually vets the path. 1024 is far beyond any real executable path and
  // stops an unbounded string from being persisted to settings.
  path: z.string().min(1).max(1024).nullable()
})

export type SetCliOverrideInput = z.infer<typeof setCliOverrideInputSchema>

// --- cli:models -------------------------------------------------------------

/**
 * Where a discovered model came from, because the two are not equally strong
 * evidence. `catalog` is what the CLI cached after the SERVER told it this
 * account has the option; `used` is a model this account has demonstrably
 * already run. Neither is a guarantee — the file is another program's private
 * state — but the distinction is real and the renderer is entitled to it.
 */
export const modelOriginSchema = z.enum(['catalog', 'used'])

export type ModelOrigin = z.infer<typeof modelOriginSchema>

/**
 * A model found by reading the installed CLI's own state, rather than one this
 * app's authors hardcoded.
 *
 * It deliberately carries NO display text. Every word the picker renders stays
 * app-owned and in the app's language — the same standard `describeAskError`
 * holds — so the CLI's own English labels never leak into the panel through
 * this channel. The id is the only thing worth crossing the bridge, and it
 * crosses through the SAME `modelIdSchema` the spawn boundary enforces.
 *
 * `provider` is the narrow write-side gate, not the wide read-side enum: an
 * entry here becomes a `ModelSelection` the moment the user clicks it, so a
 * provider this build does not offer must never reach the list.
 */
export const discoveredModelSchema = z.object({
  provider: enabledCliProviderSchema,
  modelId: modelIdSchema,
  origin: modelOriginSchema,
  /**
   * The CLI's OWN ordering of its models — lower comes first — or `null` when
   * it publishes none.
   *
   * This is the vendor saying which model it recommends, and it is the only
   * ranking that can be trusted for models this app has never measured. Codex
   * ships it: `models_cache.json` gives `gpt-5.6-terra` priority 2 and
   * describes it as its everyday balanced model. Claude ships nothing usable —
   * `orgModelDefaultCache` is null, `modelAccessCache` is empty — so its
   * models arrive unranked and the app falls back to its own measured order.
   *
   * A number is a structural fact, not copy, which is why it may cross this
   * bridge where the CLI's own labels and descriptions may not.
   */
  rank: z.number().int().nullable().default(null)
})

export type DiscoveredModel = z.infer<typeof discoveredModelSchema>

export const cliModelsResultSchema = z.array(discoveredModelSchema)

export type CliModelsResult = z.infer<typeof cliModelsResultSchema>
