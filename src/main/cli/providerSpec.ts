// The argv vocabulary of each supported CLI, as DATA rather than as code.
//
// This module is deliberately pure — it imports nothing, spawns nothing, and
// touches no filesystem. That is what lets it live outside
// `claudeExecutableValidator.ts` without weakening the sole-spawn-site rule
// the dependency guard enforces: the invariant that matters is "no
// caller-supplied string reaches argv UNVETTED", not "the array literal is
// declared in the same file as the spawn call". Everything below is a static
// constant chosen by this app. Exactly two caller-influenced values ever join
// them — a model id, and (for an `argv` provider) the question itself — and
// each one crosses a branded gate in the validator first.
//
// `verified` is the honest half of this table, and all three rows now carry it:
// every template here was run against its real binary by a human before it was
// enabled. That standard is the reason Gemini is not in this file. Its template
// was written from documentation and never run, its own docs described an
// `--output-format` flag shipped versions rejected
// (google-gemini/gemini-cli#9009), and Google has since deprecated the
// free-tier Gemini CLI in favour of Antigravity — so it was removed rather than
// kept as research for a door that no longer opens. Antigravity took its place
// and cleared the bar it never did.

import type { CliProvider } from '../../shared/ipc/cli'

/** How a provider's stdout must be read back into an `AskResult`. */
export type EnvelopeKind = 'claude-json' | 'antigravity-json' | 'codex-jsonl'

/**
 * How the question reaches the CLI — an explicit discriminant, because the
 * spawn boundary must branch on a stated CAPABILITY and never on a provider's
 * name.
 *
 * `stdin` is what this app prefers, and the reason most templates expose no
 * argument slot at all: user text that never touches a command line cannot
 * break out of one. `argv` exists because one CLI leaves no choice — verified
 * against agy.exe 1.1.15, `--print` is a required-VALUE flag that never reads
 * the prompt from stdin, so for Antigravity the question IS an argument. What
 * makes that safe is stated at the spawn boundary rather than here: one array
 * element, `shell: false`, a length ceiling, and a refusal to compose a cmd.exe
 * command line for an argv provider at all.
 */
export type PromptDelivery = 'stdin' | 'argv'

export interface ProviderSpec {
  /** Name resolved on PATH/PATHEXT — never a path, never user input. */
  executableName: string
  /** Settings key holding this provider's manual executable override. */
  overrideKey: string
  /**
   * Settings key holding the user's OPT-IN for this provider.
   *
   * Presence of the row is the whole signal: this app never probes a CLI the
   * student did not ask it to, and that decision has to outlive the process or
   * they would be re-making it on every launch. It is separate from
   * `overrideKey` on purpose — a path is a correction, an opt-in is a
   * permission, and disconnecting must not silently discard a path the user
   * typed.
   */
  connectedKey: string
  /**
   * Settings key holding the LAST outcome this app observed for the provider.
   *
   * It exists because the ask panel must know which CLIs are actually usable
   * without probing them: probing all three to build a menu is the fan-out this
   * contract removed, and a menu filtered only by the opt-in offers models for a
   * CLI that is opted in and missing — rows that answer nothing.
   *
   * It is explicitly a MEMORY, not a claim about right now. The settings screen
   * is where a fresh observation comes from.
   */
  statusKey: string
  /** Human label for the settings screen. */
  label: string
  /** Where this provider's question travels — read at the spawn site, never inferred from the id. */
  promptDelivery: PromptDelivery
  /**
   * For an `argv` provider, the flag whose VALUE the question becomes. `null`
   * for every `stdin` provider.
   *
   * It must also appear in `promptArgs`: the spawn site splices the question in
   * immediately after it, so a template that never mentions it could not be
   * composed at all.
   */
  promptFlag: string | null
  /**
   * Static argv for a one-shot invocation. For a `stdin` provider the question
   * is NEVER an element here: it is written to the child's stdin. For an `argv`
   * provider the question is spliced in after `promptFlag` as ONE element —
   * still not part of this literal, which stays a static constant either way.
   */
  promptArgs: readonly string[]
  /**
   * Static argv for a duplex streaming session, or `null` when the provider
   * has no such mode.
   *
   * Only Claude has one. `agy --print` and `codex exec` are both one-shot: they
   * read a prompt, answer, and exit. That is not a detail — the warm-session
   * work measured ~11s of the ~15.5s cost of a question as CLI boot, and a
   * provider without a duplex stdin pays that boot on EVERY question. The app
   * must say so rather than quietly feel broken. An `argv` provider can never
   * have one: a live process cannot be handed a new argv between questions.
   */
  streamingArgs: readonly string[] | null
  /** The flag that carries the model id. */
  modelFlag: string
  /** The flag that grants read access to the attachments root, or `null` if cwd alone covers it. */
  directoryFlag: string | null
  envelope: EnvelopeKind
  /** Argv that makes the binary print its version — the connection probe's vector. */
  versionArgs: readonly string[]
  /**
   * Argv that makes the binary print the help page listing the flags this
   * app's template uses — the CAPABILITY probe's vector.
   *
   * It is not always `--help`: `codex`'s prompt template lives under the
   * `exec` subcommand, and the top-level help does not list that subcommand's
   * own flags. Reading the wrong page would report a supported flag as missing
   * and leave a perfectly good CLI marked unusable.
   */
  helpArgs: readonly string[]
  /**
   * `true` only when this template was run against a real installed binary.
   * A `false` here is a spawn-time gate, not a comment.
   */
  verified: boolean
  /**
   * `true` when the template confines the CLI to a read-only tool set AT THE
   * SPAWN BOUNDARY — a contract stated in argv, not containment by
   * circumstance.
   *
   * It lives on the spec rather than being derived from the provider's name
   * because it is a property of the argv VOCABULARY: `--allowed-tools`,
   * `--mode plan` and `--sandbox read-only` each state it, and a CLI offering
   * no such flag would set this `false` and have the settings screen say so.
   */
  readOnlyTools: boolean
}

// Claude's isolation flags. These are a LATENCY decision as much as a
// containment one — see the long-form rationale kept with the original
// template in `claudeExecutableValidator.ts`. `--dangerously-skip-permissions`
// is deliberately absent and asserted absent by test.
const CLAUDE_ISOLATION = ['--safe-mode', '--strict-mcp-config', '--exclude-dynamic-system-prompt-sections'] as const

const CLAUDE_READ_ONLY_TOOLS = ['--allowed-tools', 'Read,Glob,Grep'] as const

export const PROVIDER_SPECS: Record<CliProvider, ProviderSpec> = {
  // VERIFIED against the installed binary.
  claude: {
    executableName: 'claude',
    overrideKey: 'claude.executableOverride',
    connectedKey: 'claude.connected',
    statusKey: 'claude.lastStatus',
    label: 'Claude Code',
    promptDelivery: 'stdin',
    promptFlag: null,
    promptArgs: ['-p', ...CLAUDE_ISOLATION, '--output-format', 'json', ...CLAUDE_READ_ONLY_TOOLS],
    streamingArgs: [
      '-p',
      ...CLAUDE_ISOLATION,
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      // Not optional: print mode rejects `--output-format stream-json`
      // without it ("requires --verbose", verified against the installed CLI).
      '--verbose',
      ...CLAUDE_READ_ONLY_TOOLS
    ],
    modelFlag: '--model',
    directoryFlag: '--add-dir',
    envelope: 'claude-json',
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    verified: true,
    readOnlyTools: true
  },

  // VERIFIED against agy.exe 1.1.15 on Windows, 2026-08-19 — a human ran this
  // exact vector and read the envelope it printed. This is the provider that
  // REPLACED Gemini: Google deprecated the free-tier Gemini CLI in favour of
  // Antigravity, so the old entry was deleted rather than left as research.
  //
  // Reference: https://antigravity.google/docs/cli/headless
  //
  // Three observations, none of which the documentation would have given:
  //
  //  1. `--print` is a required-VALUE string flag and NEVER reads the prompt
  //     from stdin — `--print ""` answers with an ERROR envelope, and `--print`
  //     with no value is a usage error. So this is the app's only `argv`
  //     provider. `--input-format stream-json` does exist in the binary, which
  //     would be the stdin route, but it is UNDOCUMENTED; spawning an
  //     undocumented shape at a trust boundary is the same guess this table
  //     refuses everywhere else, so argv delivery is the honest choice.
  //  2. `--mode plan` is agy's READ-ONLY mode and returns clean SUCCESS
  //     envelopes headless. It is what makes `readOnlyTools` true here: this
  //     app only answers questions about study material, and the agent must
  //     never edit. `--dangerously-skip-permissions` would auto-approve every
  //     tool including shell commands, so it is deliberately absent and
  //     asserted absent by test.
  //  3. `--add-dir` really does grant workspace access under `--mode plan` —
  //     verified by asking it to read a file inside the granted directory and
  //     getting the file's contents back.
  //
  // Its model lineup is discoverable through `agy models`, which prints
  // `id<TAB>Display Name` — but that is a SUBCOMMAND making a live network
  // call, not a state file this app can read for free, so nothing here reads
  // it. `ASK_BASELINE_MODELS` is what puts this CLI in the picker instead.
  antigravity: {
    executableName: 'agy',
    overrideKey: 'antigravity.executableOverride',
    connectedKey: 'antigravity.connected',
    statusKey: 'antigravity.lastStatus',
    label: 'Antigravity CLI',
    promptDelivery: 'argv',
    promptFlag: '--print',
    promptArgs: ['--print', '--output-format', 'json', '--mode', 'plan'],
    streamingArgs: null,
    modelFlag: '--model',
    directoryFlag: '--add-dir',
    envelope: 'antigravity-json',
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    verified: true,
    readOnlyTools: true
  },

  // VERIFIED against codex-cli 0.148.0-alpha.15 on Windows.
  //
  // `exec -` is the shape that keeps the question off argv: `-` makes stdin
  // the whole prompt. `--sandbox read-only` is passed EXPLICITLY even though
  // the documentation calls read-only the default, for the same reason
  // `--strict-mcp-config` is passed to Claude alongside safe mode: containment
  // that is stated at the spawn boundary cannot be changed by a config file
  // the app never read.
  //
  // `--skip-git-repo-check` is NOT optional, and no documentation mentioned
  // it. The app's cwd is `userData/attachments`, which is not a git
  // repository, and without this flag every single run dies before reaching
  // the model with "Not inside a trusted directory and --skip-git-repo-check
  // was not specified." The template that shipped without it would have failed
  // 100% of the time — found only by running the real binary, which is why a
  // help-page probe is a floor and not a proof.
  //
  // `--ignore-user-config` is the `--safe-mode` parallel: it stops the
  // student's own `config.toml`, MCP servers and agents from loading. That
  // matters less for tokens than expected (21.5k vs 22.3k input on a trivial
  // question) and a lot for PARSING — without it, MCP worker errors are
  // interleaved into the JSONL stream on stdout. Auth still resolves through
  // `CODEX_HOME`, which is what makes the flag usable here at all.
  //
  // `--ephemeral` keeps codex from writing session files: this app owns its
  // own conversation history, so those files are litter it would never read.
  codex: {
    executableName: 'codex',
    overrideKey: 'codex.executableOverride',
    connectedKey: 'codex.connected',
    statusKey: 'codex.lastStatus',
    label: 'Codex CLI',
    promptDelivery: 'stdin',
    promptFlag: null,
    promptArgs: [
      'exec',
      '-',
      '--json',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-user-config'
    ],
    streamingArgs: null,
    modelFlag: '--model',
    directoryFlag: '--cd',
    envelope: 'codex-jsonl',
    versionArgs: ['--version'],
    helpArgs: ['exec', '--help'],
    verified: true,
    readOnlyTools: true
  }
}

/**
 * What a provider's spec CLAIMS, before any probe has confirmed it.
 *
 * Takes the SPEC rather than the provider id so nothing here can be decided by
 * a name comparison — and so the capability probe can be exercised against a
 * spec no build ships.
 */
export function declaredCapabilities(spec: ProviderSpec): {
  structuredOutput: boolean
  warmSession: boolean
  readOnlyTools: boolean
} {
  return {
    structuredOutput: true,
    warmSession: spec.streamingArgs !== null,
    // Only containment stated in argv counts, and the spec is where each
    // provider states it.
    readOnlyTools: spec.readOnlyTools
  }
}
