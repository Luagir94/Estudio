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
export const cliProviderSchema = z.enum(['claude', 'antigravity', 'codex'])

export type CliProvider = z.infer<typeof cliProviderSchema>

/**
 * The providers the app actually offers — menu order, and the order the
 * settings screen probes them in.
 *
 * Gemini was REMOVED rather than disabled: Google deprecated the free-tier
 * Gemini CLI in favour of Antigravity, so keeping its spec around as
 * documentation would have been describing a door that no longer opens.
 * Antigravity replaces it and is ENABLED, because unlike Gemini its template
 * was run against the real binary (agy.exe 1.1.15 on Windows, 2026-08-19) and
 * it states its containment at the spawn boundary: `--mode plan` is a read-only
 * mode, which is exactly what Gemini never had.
 *
 * Every provider the wide enum admits is enabled today. That is a fact about
 * this table, not a reason to collapse the two — `enabledCliProviderSchema`
 * below stays the write-side gate so the next provider added as unverified is
 * inert until someone runs it.
 *
 * @see https://antigravity.google/docs/cli/headless
 */
export const CLI_PROVIDERS: readonly CliProvider[] = ['claude', 'antigravity', 'codex']

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
 * enum is gone: no CLI of the three can be asked, from inside this app, for the
 * models an account actually has (verified — `claude` has no `models`
 * subcommand and `codex` documents none; `agy models` exists but is a live
 * network call this app deliberately does not make), so a fixed table could
 * only ever describe what the app's authors happened to know on the day they
 * wrote it.
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
 * `gemini-3.1-pro-high`, `gpt-5-codex`, `o3`. (Antigravity serves Gemini
 * models, so its ids are legitimately named after them — that is a MODEL name,
 * not the removed provider.)
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

/** The three-state classification, shared by the live status and the remembered one. */
export const cliStatusValueSchema = z.enum(['connected', 'not-found', 'unusable'])

export type CliStatusValue = z.infer<typeof cliStatusValueSchema>

/**
 * The STRUCTURED reason behind an `unusable` status — the part of the outcome
 * the RENDERER is allowed to turn into prose (i18n phase 2 "CLI probe
 * reasons"). It lives alongside `detail` below, never replacing it: `detail`
 * stays the main process's own English wording, kept on the payload for
 * diagnostics and logs, but it must never reach a screen glued onto Spanish
 * prose. This union is what the renderer localizes instead — one literal per
 * distinct failure `cliProbeService` can produce, carrying only the data (a
 * path, a timeout budget, an exit code) needed to phrase it, never English
 * text of its own.
 *
 * Modeled on `askArtifactReportSchema` (`src/shared/ipc/ask.ts`): a Zod
 * discriminated union on a `code` field, one object per case. No i18n import
 * here — this module stays framework-free and is parsed on BOTH processes.
 */
export const cliProbeFailureReasonSchema = z.discriminatedUnion('code', [
  // The resolved or overridden path failed pre-spawn validation — nothing was
  // ever spawned.
  z.object({ code: z.literal('invalid-executable'), path: z.string() }),
  // The process was killed after the hard timeout budget elapsed.
  z.object({ code: z.literal('timeout'), timeoutMs: z.number() }),
  // The process exited non-zero. `exitCode` is `null` only when the runtime
  // itself never reported one, mirroring `ChildProcess`'s own `close` event.
  z.object({ code: z.literal('exit-code'), exitCode: z.number().nullable() }),
  // Exit 0, but stdout carried nothing that parses as a version.
  z.object({ code: z.literal('unrecognized-output') })
])

export type CliProbeFailureReason = z.infer<typeof cliProbeFailureReasonSchema>

// Same three-state classification the single-provider probe already used
// (spec "Three-State Status Classification"), now carried per provider. The
// renderer still never sees a raw exit code or spawn error.
export const cliProviderStatusSchema = z.object({
  provider: cliProviderSchema,
  status: cliStatusValueSchema,
  version: z.string().nullable(),
  resolvedPath: z.string().nullable(),
  source: z.enum(['auto', 'override']),
  overridePath: z.string().nullable(),
  detail: z.string().nullable(),
  /**
   * The structured counterpart of `detail` — see `cliProbeFailureReasonSchema`
   * above. `null` whenever `status` is not `unusable`, and also whenever the
   * failure predates this field or does not fit a known case; the renderer
   * falls back to generic Spanish in either case, never to `detail`.
   */
  failureReason: cliProbeFailureReasonSchema.nullable(),
  /**
   * What the INSTALLED binary was observed to support, rather than what its
   * documentation claims. Null until a capability probe has run.
   *
   * This field is the app's answer to a problem it cannot solve at authoring
   * time: a CLI's own documentation can describe a flag its shipped versions
   * reject — Gemini's did, for `--output-format`
   * (google-gemini/gemini-cli#9009), and that provider is gone precisely
   * because documentation was all it ever had. A template written from a
   * document is a guess, and this app does not spawn guesses — it probes the
   * binary in front of it and records what actually answered.
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

// --- cli:probe --------------------------------------------------------------

/**
 * The input of the ONE channel that starts a probe.
 *
 * A probe is per PROVIDER and always has been at the service level; what
 * changed is that no caller may ask for "all of them" any more. There used to
 * be a `cli:status` channel that probed every supported CLI at once, and the
 * settings screen fired it on mount — opening Ajustes spawned up to six
 * short-lived processes for CLIs the student may not even have installed.
 *
 * Connecting a CLI is now an explicit act: one button, one provider, one probe.
 * Removing the bulk channel is what makes that guarantee structural instead of
 * a habit the next caller can break, because there is no longer an API to
 * break it with.
 *
 * The gate is the NARROW write-side enum, not the wide read-side one: this
 * payload selects an argv template and starts a process, which is exactly the
 * boundary `enabledCliProviderSchema` exists to guard.
 */
export const probeCliInputSchema = z.object({ provider: enabledCliProviderSchema })

export type ProbeCliInput = z.infer<typeof probeCliInputSchema>

// --- cli:preferences / cli:disconnect ---------------------------------------

/**
 * What the app has PERSISTED about one CLI, as opposed to what it has observed.
 *
 * Everything here is readable without starting a process, which is the whole
 * reason it is a separate shape from `CliProviderStatus`: the settings screen
 * and the ask panel both need to know where they stand BEFORE deciding whether
 * to probe anything, and a screen that had to spawn to find out would be the
 * fan-out this contract exists to prevent.
 *
 * The two fields are deliberately independent:
 *
 *  - `connected` is a PERMISSION — which CLIs this app may spawn, never which
 *    ones work. It exists because the opt-in used to die with the process, so
 *    the screen re-asked on every launch for a decision already made.
 *  - `overridePath` is a CORRECTION the student typed. It survives
 *    disconnecting, because reconnecting should not mean finding an install
 *    location for a second time.
 *
 * A provider can carry a path without being connected — that is exactly the
 * state a returning student is in after this contract landed — so a shape that
 * folded the two together could not describe them.
 *
 * The WIDE read-side enum: a row persisted by an older build naming a provider
 * this one no longer enables must still parse, so it can be shown and cleared
 * rather than throwing on the way out of the database.
 */
export const cliPreferenceSchema = z.object({
  provider: cliProviderSchema,
  connected: z.boolean(),
  overridePath: z.string().nullable(),
  /**
   * What the LAST probe saw, or `null` when this app has never looked.
   *
   * A memory, deliberately not a claim about right now — the binary can be
   * uninstalled between launches and this row would not know. It is here so a
   * surface that must not spawn (the ask panel) can still tell a CLI that works
   * from one that is merely opted in, instead of offering models for a CLI that
   * would answer nothing.
   */
  lastStatus: cliStatusValueSchema.nullable()
})

export type CliPreference = z.infer<typeof cliPreferenceSchema>

/** One entry per supported provider, in menu order — including the ones with nothing saved. */
export const cliPreferencesResultSchema = z.array(cliPreferenceSchema)

export type CliPreferencesResult = z.infer<typeof cliPreferencesResultSchema>

/**
 * Withdrawing the opt-in. Deliberately gated on the WIDE enum, unlike every
 * other write in this contract.
 *
 * The narrow gate exists to stop a payload from reaching a spawn. This payload
 * REMOVES a permission to spawn, so the reasoning inverts: refusing to
 * disconnect a provider this build no longer enables would leave the student
 * with a standing permission they cannot withdraw.
 */
export const disconnectCliInputSchema = z.object({ provider: cliProviderSchema })

export type DisconnectCliInput = z.infer<typeof disconnectCliInputSchema>

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
