import type { ChildProcess } from 'node:child_process'
import type { CliProvider } from '../../shared/ipc/cli'
import { PROVIDER_SPECS } from '../cli/providerSpec'
import {
  spawnPromptExecution,
  terminateSpawnedProcess,
  type ClearedProvider,
  type ValidatedArgvPrompt,
  type ValidatedExecutablePath,
  type ValidatedModelId
} from './claudeExecutableValidator'
import type { WarmPromptSession } from './warmPromptSession'

// The ONE place the warm session meets the other providers. The composition
// root once wired the Claude-only warm session as `askService`'s spawn dep for
// every provider, and the failure was silent twice over: TypeScript accepted
// the four-argument session where the five-argument contract lived (the argv
// prompt just vanished), and the no-streaming-mode refusal died in an empty
// catch — an antigravity question hung to its five-minute timeout, a codex one
// failed with a code-less error. This router is the fix and the guard: a
// provider WITH a streaming mode (`streamingArgs` in its spec) goes through
// the warm process, every other one goes through the exact one-shot pair
// `askService` defaults to when nothing is injected at all.
//
// Kept beside the warm session rather than in the composition root so the
// selection is unit-provable and `index.ts` stays wiring-only.

export interface PromptSpawnRouterDeps {
  warmSession: Pick<WarmPromptSession, 'spawnPrompt' | 'terminate'>
  /** Test seams only — the defaults ARE `askService`'s own default pair, reused, never reimplemented. */
  spawnOneShot?: (
    provider: ClearedProvider,
    absPath: ValidatedExecutablePath,
    attachmentsRoot: string,
    model: ValidatedModelId,
    prompt: ValidatedArgvPrompt | null
  ) => ChildProcess
  terminateOneShot?: (child: ChildProcess) => void
}

/** The full five-argument contract `askService` expects — satisfying it here is the compile-time proof of the wiring. */
export interface PromptSpawnRouter {
  spawnPrompt: (
    provider: ClearedProvider,
    absPath: ValidatedExecutablePath,
    attachmentsRoot: string,
    model: ValidatedModelId,
    prompt: ValidatedArgvPrompt | null
  ) => ChildProcess
  terminate: (child: ChildProcess) => void
}

export function createPromptSpawnRouter({
  warmSession,
  // Mirrors `askService`'s default `spawnPrompt` exactly: `undefined` keeps
  // `spawnPromptExecution`'s own real spawn, the prompt trails it (see that
  // parameter's rationale in the validator).
  spawnOneShot = (provider, absPath, attachmentsRoot, model, prompt) =>
    spawnPromptExecution(provider, absPath, attachmentsRoot, model, undefined, prompt),
  terminateOneShot = terminateSpawnedProcess
}: PromptSpawnRouterDeps): PromptSpawnRouter {
  // Which path spawned each handle. `terminate` receives only the handle —
  // cancel and timeout land there blind — and the two kills are not
  // interchangeable: the warm session's drops the SHARED process, the
  // one-shot's tree-kills a dedicated child. A WeakSet, so a settled handle's
  // entry dies with the handle instead of accumulating one per question.
  const warmHandles = new WeakSet<ChildProcess>()

  return {
    spawnPrompt: (provider, absPath, attachmentsRoot, model, prompt) => {
      if (PROVIDER_SPECS[provider as CliProvider].streamingArgs !== null) {
        if (prompt !== null) {
          // A streaming provider is stdin-delivery by construction (`providerSpec`:
          // a live process cannot be handed a new argv between questions), so a
          // prompt here means a spec changed underneath that invariant. Refused
          // loudly — dropping it is the exact silent-drop bug this router replaces.
          throw new Error(`${provider} has a streaming mode but was handed an argv prompt`)
        }
        // `prompt` is narrowed to `null`, which is the only value the warm
        // session's fifth parameter admits — the compiler re-checks this
        // hand-off on every edit.
        const handle = warmSession.spawnPrompt(provider, absPath, attachmentsRoot, model, prompt)
        warmHandles.add(handle)
        return handle
      }
      return spawnOneShot(provider, absPath, attachmentsRoot, model, prompt)
    },
    terminate: (child) => {
      if (warmHandles.has(child)) {
        warmSession.terminate(child)
        return
      }
      terminateOneShot(child)
    }
  }
}
