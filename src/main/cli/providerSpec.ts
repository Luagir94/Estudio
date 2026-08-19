import type { CliProvider } from '../../shared/ipc/cli'

// The argv vocabulary of each supported CLI, as DATA rather than as code.
//
// This module is deliberately pure — it imports nothing, spawns nothing, and
// touches no filesystem. That is what lets it live outside
// `claudeExecutableValidator.ts` without weakening the sole-spawn-site rule
// the dependency-cruiser guard enforces: the invariant that matters is "no
// caller-supplied string reaches argv", not "the array literal is declared in
// the same file as the spawn call". Everything below is a static constant
// chosen by this app. The only caller-influenced value that ever joins them
// is a model id, and that one crosses a branded gate first.
//
// `verified` is the honest half of this table. Claude's template was checked
// against the installed binary (`claude --help`, decision #238's convention).
// The other two were written from published documentation and NOT run, because
// neither binary is installed on the machine this was authored on. Gemini's
// documentation is known to describe at least one flag that shipped versions
// reject (google-gemini/gemini-cli#9009), so documentation alone is treated
// here as a hypothesis, not as a fact — an unverified provider stays inert
// until `probeCapabilities` confirms the binary in front of it agrees.

/** How a provider's stdout must be read back into an `AskResult`. */
export type EnvelopeKind = 'claude-json' | 'gemini-json' | 'codex-jsonl'

export interface ProviderSpec {
  /** Name resolved on PATH/PATHEXT — never a path, never user input. */
  executableName: string
  /** Settings key holding this provider's manual executable override. */
  overrideKey: string
  /** Human label for the settings screen. */
  label: string
  /**
   * Static argv for a one-shot, prompt-on-stdin invocation. The question is
   * NEVER an element here: it is written to the child's stdin, which is the
   * whole reason no template exposes a caller-supplied slot.
   */
  promptArgs: readonly string[]
  /**
   * Static argv for a duplex streaming session, or `null` when the provider
   * has no such mode.
   *
   * Only Claude has one. Gemini's headless mode and `codex exec` are both
   * one-shot: they read a prompt, answer, and exit. That is not a detail —
   * the warm-session work measured ~11s of the ~15.5s cost of a question as
   * CLI boot, and a provider without a duplex stdin pays that boot on EVERY
   * question. The app must say so rather than quietly feel broken.
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
    label: 'Claude Code',
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
    verified: true
  },

  // DISABLED and UNVERIFIED. Kept here rather than deleted: the research below
  // is real, and re-enabling is one line in `CLI_PROVIDERS` plus a verification
  // pass against a real binary. Being absent from that list means nothing
  // probes it, nothing offers it, and `clearProvider` refuses it outright — so
  // this entry is documentation, not a live code path.
  //
  // Written from https://google-gemini.github.io/gemini-cli
  // headless-mode documentation, never run.
  //
  // Two known risks, both of which the capability probe is what settles:
  //  1. `--output-format json` is documented but reported missing from shipped
  //     versions (issue #9009). If the probe finds it rejected, this provider
  //     stays unusable rather than silently falling back to prose the response
  //     parser would have to guess at.
  //  2. There is NO tool allowlist. Claude's containment rests on
  //     `--allowed-tools Read,Glob,Grep` plus print mode auto-denying whatever
  //     falls outside it; Gemini offers no equivalent, only `--approval-mode`.
  //     `--yolo` is what would auto-approve, so it is deliberately absent —
  //     without it, a headless run has nobody to approve a write, which is
  //     containment by circumstance rather than by contract. That is weaker,
  //     and `readOnlyTools` is reported `false` for this provider rather than
  //     dressed up as equivalent.
  gemini: {
    executableName: 'gemini',
    overrideKey: 'gemini.executableOverride',
    label: 'Gemini CLI',
    promptArgs: ['--output-format', 'json'],
    streamingArgs: null,
    modelFlag: '--model',
    directoryFlag: '--include-directories',
    envelope: 'gemini-json',
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    verified: false
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
    label: 'Codex CLI',
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
    verified: true
  }
}

/** What a provider's spec CLAIMS, before any probe has confirmed it. */
export function declaredCapabilities(provider: CliProvider): {
  structuredOutput: boolean
  warmSession: boolean
  readOnlyTools: boolean
} {
  const spec = PROVIDER_SPECS[provider]
  return {
    structuredOutput: true,
    warmSession: spec.streamingArgs !== null,
    // Only a real allowlist counts. Gemini has none, and saying so is the
    // point — see the note on its spec above.
    readOnlyTools: provider !== 'gemini'
  }
}
