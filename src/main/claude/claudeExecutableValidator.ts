import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { constants } from 'node:fs'
import path from 'node:path'
import { isProviderEnabled, MODEL_ID_PATTERN, type CliProvider } from '../../shared/ipc/cli'
import { PROVIDER_SPECS } from '../cli/providerSpec'

// Main-process trust boundary (design D2/D3, spec "Safe Spawn Vector" /
// "Pre-Spawn Validation"). Mirrors `campusUrlValidator.ts`'s shape — a pure
// pre-flight check gates a dangerous operation before it happens — but goes
// further: this module is also the SOLE `child_process` import in the
// codebase, enforced by the `child-process-only-in-claude-validator`
// dependency-cruiser rule (`.dependency-cruiser.cjs`) and proven to fire by
// a fixture-backed smoke test (`tooling/dependencyGuard.test.ts`).
//
// `shell: true` is FORBIDDEN here (decision #213 / CVE-2024-27980): it is
// only safe for sanitized input, and a user-typed override path is not
// sanitized. Everything below spawns with `shell: false` and a fixed
// argument vector — no user-typed value is ever concatenated into a shell
// string.

const WINDOWS_RUNNABLE_EXTENSIONS = new Set(['.com', '.exe', '.bat', '.cmd'])
const SHELL_SHIM_EXTENSIONS = new Set(['.cmd', '.bat'])

// Characters that would let a candidate path break out of the
// `cmd.exe /d /s /c "<path>" --version` vector (D2) or otherwise confuse a
// shell — rejected outright, regardless of whether the candidate is a shim.
// This rejection is what keeps that vector injection-safe.
const UNSAFE_PATH_PATTERN = /["%\n]/

// Nominal-typing brand (review finding, closed on this branch): a plain
// `string` and a validated path are structurally identical, so without a
// brand nothing stops an unvalidated string reaching `spawnVersionProbe`.
// The symbol is never exported, so only `validateExecutableCandidate` can
// produce a `ValidatedExecutablePath` — after it has already run the
// `UNSAFE_PATH_PATTERN` rejection that keeps the cmd.exe vector safe.
declare const validatedExecutable: unique symbol
export type ValidatedExecutablePath = string & { readonly [validatedExecutable]: true }

/**
 * The exact subset of `node:fs/promises` this module needs — narrow enough
 * to fake trivially in tests, wide enough that the real implementations can
 * be passed through unmodified.
 */
export interface ValidatorFsPort {
  stat(candidatePath: string): Promise<{ isFile(): boolean }>
  access(candidatePath: string, mode?: number): Promise<void>
}

export interface ValidatorPorts {
  fs: ValidatorFsPort
  /** Defaults to `process.platform` — injected so both branches are testable from either host OS. */
  platform?: NodeJS.Platform
}

/**
 * Pre-spawn gate (spec "Pre-Spawn Validation"): absolute path, exists, is a
 * regular file, and is runnable (a PATHEXT-style extension on Windows,
 * `X_OK` on POSIX). Also rejects any candidate containing a `"`, `%`, or
 * newline character before ever touching the filesystem.
 *
 * Returns the path branded `ValidatedExecutablePath` on success, `null` on
 * rejection — the brand makes an unvalidated `string` a compile error here.
 */
export async function validateExecutableCandidate(
  candidatePath: string,
  { fs, platform = process.platform }: ValidatorPorts
): Promise<ValidatedExecutablePath | null> {
  if (!path.isAbsolute(candidatePath) || UNSAFE_PATH_PATTERN.test(candidatePath)) {
    return null
  }

  let stats: { isFile(): boolean }
  try {
    stats = await fs.stat(candidatePath)
  } catch {
    return null
  }
  if (!stats.isFile()) {
    return null
  }

  if (platform === 'win32') {
    if (!WINDOWS_RUNNABLE_EXTENSIONS.has(path.extname(candidatePath).toLowerCase())) {
      return null
    }
    return candidatePath as ValidatedExecutablePath
  }

  try {
    await fs.access(candidatePath, constants.X_OK)
    return candidatePath as ValidatedExecutablePath
  } catch {
    return null
  }
}

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess

/**
 * Spawns `<absPath> --version` — the fixed argument vector (spec "Safe
 * Spawn Vector"; design D2). No user-typed value is ever concatenated into
 * this vector beyond the already-validated path itself.
 *
 * `.cmd`/`.bat` shims cannot be spawned directly: Node errors `EINVAL`
 * without the `shell` option since the CVE-2024-27980 security release.
 * Spawning `cmd.exe` itself with an explicit `/d /s /c` vector sidesteps
 * that restriction — the spawned file is `cmd.exe`, not a batch file
 * (decision #213). Everything else spawns directly. `shell` is always
 * `false` in both branches.
 *
 * `absPath` is a `ValidatedExecutablePath` — only what
 * `validateExecutableCandidate` returns type-checks here, which is what
 * makes the `.cmd`/`.bat` concatenation below injection-safe: the brand
 * guarantees `UNSAFE_PATH_PATTERN` already rejected `"`, `%`, and newline.
 * Timeout/kill policy belongs to the caller (the probe service).
 */
export function spawnVersionProbe(absPath: ValidatedExecutablePath, spawnFn: SpawnFn = nodeSpawn): ChildProcess {
  const extension = path.extname(absPath).toLowerCase()

  if (SHELL_SHIM_EXTENSIONS.has(extension)) {
    const comSpec = process.env.ComSpec ?? 'cmd.exe'
    // The command line is wrapped in a SECOND pair of quotes on purpose. With
    // `/S`, cmd.exe strips the first and the last quote character on the line
    // and passes the rest through unquoted — so a single pair around the path
    // is exactly the pair that gets removed. Verified: without the outer pair
    // a path containing a space fails to launch at all, and one containing
    // `&` splits into two commands. The outer pair absorbs the strip and
    // leaves the inner quoting intact.
    return spawnFn(comSpec, ['/d', '/s', '/c', `""${absPath}" --version"`], {
      windowsVerbatimArguments: true,
      shell: false
    })
  }

  return spawnFn(absPath, ['--version'], { shell: false })
}

/**
 * Spawns `<absPath> <helpArgs>` — the CAPABILITY probe's fixed vector.
 *
 * Every token comes from the provider's own spec, never from a caller, so this
 * stays inside the same no-user-input-in-argv rule as every other spawn here.
 * Reading a help page costs nothing: no tokens, no account, no network.
 *
 * It exists because two of the three argv templates were written from
 * published documentation and never run, and documentation has already been
 * wrong once for one of them (google-gemini/gemini-cli#9009). Asking the
 * installed binary which flags it actually lists is the difference between
 * shipping a guess and shipping an observation.
 */
export function spawnHelpProbe(
  provider: CliProvider,
  absPath: ValidatedExecutablePath,
  spawnFn: SpawnFn = nodeSpawn
): ChildProcess {
  const args = PROVIDER_SPECS[provider].helpArgs

  if (SHELL_SHIM_EXTENSIONS.has(path.extname(absPath).toLowerCase())) {
    const comSpec = process.env.ComSpec ?? 'cmd.exe'
    // Same double-quote wrapping as the version probe: `/S` strips the first
    // and last quote on the line, so the outer pair absorbs the strip.
    return spawnFn(comSpec, ['/d', '/s', '/c', `""${absPath}" ${args.join(' ')}"`], {
      windowsVerbatimArguments: true,
      shell: false
    })
  }

  return spawnFn(absPath, args, { shell: false })
}

// --- provider selection and the model-id gate --------------------------------

// The argv templates moved to `../cli/providerSpec.ts` when the app grew from
// one CLI to three. They are still static constants chosen by this app, and no
// template exposes a caller-supplied argument slot — the invariant the
// sole-spawn-site rule protects is "no caller string reaches argv", not "the
// literal is declared in this file".
//
// Two caller-influenced values now exist, and each crosses a BRAND before it
// can reach a command line:
//   - the executable path, branded by `validateExecutableCandidate` (above);
//   - the model id, branded by `validateModelId` (below).
// A third brand, `ClearedProvider`, makes it a compile error to spawn a
// provider whose template was never confirmed against a real binary.

/**
 * Nominal-typing brand for a model id, mirroring `ValidatedExecutablePath`.
 * The symbol is never exported, so only `validateModelId` can mint one —
 * after `MODEL_ID_PATTERN` has already excluded every character that could
 * break out of the cmd.exe vector.
 */
declare const validatedModel: unique symbol
export type ValidatedModelId = string & { readonly [validatedModel]: true }

/**
 * The gate that replaced the old three-key allowlist table.
 *
 * That table resolved an opaque key to one of three literals written in this
 * file, which was airtight but could only ever offer what the app's authors
 * hardcoded. No CLI of the three can enumerate the models an account actually
 * has — verified: `claude` ships no `models` subcommand, and neither `gemini`
 * nor `codex` documents one — so the choice was between a list that goes stale
 * and a validated free value. This is the second, and `MODEL_ID_PATTERN` is
 * what keeps it as safe as the table was: a whitelist of characters, so
 * everything dangerous is excluded by construction rather than by enumeration.
 */
export function validateModelId(candidate: string): ValidatedModelId | null {
  return MODEL_ID_PATTERN.test(candidate) ? (candidate as ValidatedModelId) : null
}

/**
 * Nominal-typing brand for a provider whose argv template is known to match
 * the binary that will receive it.
 *
 * This exists because two of the three templates were written from published
 * documentation and never run — and Gemini's documentation is known to
 * describe a flag shipped versions reject (google-gemini/gemini-cli#9009).
 * Spawning on the strength of a document is a guess, and a guess at this
 * boundary is a malformed command line aimed at the student's own account.
 * A provider marked `verified` in its spec clears statically; every other
 * provider must be cleared by an observed capability probe, and until then it
 * cannot be passed to a spawn function at all.
 */
declare const clearedProvider: unique symbol
export type ClearedProvider = CliProvider & { readonly [clearedProvider]: true }

/**
 * Clears a provider for spawning. Returns `null` when its template was never
 * verified and the probe has not confirmed structured output on the installed
 * binary — the caller maps that to a typed `CLI_UNUSABLE`, never a hopeful
 * attempt.
 */
export function clearProvider(
  provider: CliProvider,
  probed: { structuredOutput: boolean } | null
): ClearedProvider | null {
  // Defence in depth. The write-side schemas already refuse a disabled
  // provider at the bridge, but this is the last gate before a spawn, and a
  // provider the app does not offer must never reach one — however it got here.
  if (!isProviderEnabled(provider)) {
    return null
  }
  if (PROVIDER_SPECS[provider].verified) {
    return provider as ClearedProvider
  }
  return probed?.structuredOutput === true ? (provider as ClearedProvider) : null
}

/**
 * Spawns a one-shot, prompt-on-stdin invocation of `provider` (design D1).
 *
 * The question is NEVER an argument: the caller writes the composed prompt to
 * `child.stdin` and ends it, which is what keeps arbitrary user text away from
 * the cmd.exe command string.
 *
 * `attachmentsRoot` is app-computed (`userData/attachments`), but it still
 * enters that command string on the shim branch, so it is re-asserted here
 * against the same absolute + `UNSAFE_PATH_PATTERN` rules that brand the
 * executable path. A violation THROWS: an invalid root is an app-invariant
 * breach, and the caller maps it to a typed, logged `EXECUTION_FAILED` —
 * never a silent fallback to some other directory.
 *
 * `cwd` is the attachments root rather than the app directory, so the CLI's
 * default project-dir access and its directory flag coincide and the app's own
 * tree is never the working directory. Env passes through untouched — every
 * provider needs the user's own auth and config.
 */
export function spawnPromptExecution(
  provider: ClearedProvider,
  absPath: ValidatedExecutablePath,
  attachmentsRoot: string,
  model: ValidatedModelId,
  spawnFn: SpawnFn = nodeSpawn
): ChildProcess {
  return spawnWithTemplate(
    PROVIDER_SPECS[provider as CliProvider].promptArgs,
    provider,
    absPath,
    attachmentsRoot,
    model,
    spawnFn
  )
}

/**
 * Spawns a duplex STREAMING session, so one process can serve many questions
 * instead of dying after one.
 *
 * THROWS for a provider that has no such mode. Only Claude does: Gemini's
 * headless mode and `codex exec` both read a prompt, answer, and exit. That is
 * a measured cost, not a cosmetic difference — a warm process answers in ~2s
 * where a cold spawn costs ~15.5s, nearly all of it boot — so the caller must
 * decide what to do about it rather than receive a quietly degraded session.
 */
export function spawnStreamingSession(
  provider: ClearedProvider,
  absPath: ValidatedExecutablePath,
  attachmentsRoot: string,
  model: ValidatedModelId,
  spawnFn: SpawnFn = nodeSpawn
): ChildProcess {
  const template = PROVIDER_SPECS[provider as CliProvider].streamingArgs
  if (template === null) {
    throw new Error(`${provider} has no streaming session mode`)
  }
  return spawnWithTemplate(template, provider, absPath, attachmentsRoot, model, spawnFn)
}

/**
 * The ONE place any prompt-carrying template becomes a real command line.
 * Every provider and both invocation shapes share it, so the root
 * re-assertion, the cmd.exe quoting and the flag composition cannot be got
 * right in one and wrong in another.
 */
function spawnWithTemplate(
  template: readonly string[],
  provider: CliProvider,
  absPath: ValidatedExecutablePath,
  attachmentsRoot: string,
  model: ValidatedModelId,
  spawnFn: SpawnFn
): ChildProcess {
  if (!path.isAbsolute(attachmentsRoot) || UNSAFE_PATH_PATTERN.test(attachmentsRoot)) {
    throw new Error('invalid attachments root')
  }

  const spec = PROVIDER_SPECS[provider]
  // Branded, so an unvalidated string cannot reach this line at all.
  const modelArgs = [spec.modelFlag, model]
  const options: SpawnOptions = { shell: false, cwd: attachmentsRoot, stdio: ['pipe', 'pipe', 'pipe'] }

  if (SHELL_SHIM_EXTENSIONS.has(path.extname(absPath).toLowerCase())) {
    const comSpec = process.env.ComSpec ?? 'cmd.exe'
    // Same double-quote wrapping as the probe: `/S` strips the first and last
    // quote on the line, so the outer pair absorbs the strip and leaves both
    // the path's and the root's own quoting intact.
    const directory = spec.directoryFlag === null ? '' : ` ${spec.directoryFlag} "${attachmentsRoot}"`
    const commandLine = `""${absPath}" ${template.join(' ')} ${modelArgs.join(' ')}${directory}"`
    return spawnFn(comSpec, ['/d', '/s', '/c', commandLine], { ...options, windowsVerbatimArguments: true })
  }

  const directoryArgs = spec.directoryFlag === null ? [] : [spec.directoryFlag, attachmentsRoot]
  return spawnFn(absPath, [...template, ...modelArgs, ...directoryArgs], options)
}

/**
 * Kills a spawned prompt execution and everything below it (design D4).
 *
 * On the shim branch the spawned process is cmd.exe and the real CLI is a
 * GRANDCHILD, so `child.kill()` alone would reap the wrapper and leave the
 * grandchild running — burning the user's own tokens for up to the full
 * timeout. `taskkill /T` walks the tree; the pid is numeric and the argv is
 * fixed, so this stays inside the same no-user-input-in-argv rule as every
 * other spawn here. POSIX has no such wrapper, so `SIGKILL` is enough.
 */
export function terminateSpawnedProcess(
  child: ChildProcess,
  spawnFn: SpawnFn = nodeSpawn,
  platform: NodeJS.Platform = process.platform
): void {
  // A child that already exited has no pid — composing `taskkill /pid
  // undefined` would be a malformed vector, so fall back instead.
  if (platform === 'win32' && child.pid !== undefined) {
    spawnFn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false })
    return
  }

  child.kill('SIGKILL')
}
