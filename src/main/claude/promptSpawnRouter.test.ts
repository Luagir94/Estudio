import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import type { AskServiceDeps } from '../ask/askService'
import { createPromptSpawnRouter } from './promptSpawnRouter'
import {
  clearProvider,
  validateArgvPrompt,
  validateModelId,
  type ClearedProvider,
  type ValidatedArgvPrompt,
  type ValidatedExecutablePath,
  type ValidatedModelId
} from './claudeExecutableValidator'

// The router exists because of one production bug: `src/main/index.ts` wired
// the CLAUDE-ONLY warm session as `askService`'s spawn dep for every provider,
// so a non-Claude question either hung to its five-minute timeout
// (antigravity, whose argv prompt the warm session silently dropped) or died
// as a code-less `EXECUTION_FAILED` (codex). These tests pin the routing
// contract: a provider WITH a streaming mode gets the warm session, every
// other one gets the same one-shot pair `askService` defaults to — argv
// prompt intact. Everything injected, as in `warmPromptSession.test.ts`.

const VALIDATED = 'C:\\tools\\cli.exe' as ValidatedExecutablePath
const ROOT = 'C:\\Users\\testuser\\AppData\\Roaming\\course-companion\\attachments'

const CLAUDE = clearProvider('claude', null) as ClearedProvider
const ANTIGRAVITY = clearProvider('antigravity', null) as ClearedProvider
const CODEX = clearProvider('codex', null) as ClearedProvider

/** Mirrors the validator tests' `asModel`: mints the brand through the real gate. */
const asModel = (id: string): ValidatedModelId => validateModelId(id) as ValidatedModelId
const asArgvPrompt = (text: string): ValidatedArgvPrompt => validateArgvPrompt(text) as ValidatedArgvPrompt

function harness(): {
  router: ReturnType<typeof createPromptSpawnRouter>
  warmSession: { spawnPrompt: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }
  spawnOneShot: ReturnType<typeof vi.fn>
  terminateOneShot: ReturnType<typeof vi.fn>
  warmHandle: ChildProcess
  oneShotChild: ChildProcess
} {
  const warmHandle = new EventEmitter() as unknown as ChildProcess
  const oneShotChild = new EventEmitter() as unknown as ChildProcess
  const warmSession = { spawnPrompt: vi.fn(() => warmHandle), terminate: vi.fn() }
  const spawnOneShot = vi.fn(() => oneShotChild)
  const terminateOneShot = vi.fn()
  const router = createPromptSpawnRouter({ warmSession, spawnOneShot, terminateOneShot })
  return { router, warmSession, spawnOneShot, terminateOneShot, warmHandle, oneShotChild }
}

describe('createPromptSpawnRouter', () => {
  it('routes claude — the one provider with a streaming mode — through the warm session', () => {
    const { router, warmSession, spawnOneShot, warmHandle } = harness()
    const model = asModel('claude-sonnet-5')

    const child = router.spawnPrompt(CLAUDE, VALIDATED, ROOT, model, null)

    expect(child).toBe(warmHandle)
    expect(warmSession.spawnPrompt).toHaveBeenCalledWith(CLAUDE, VALIDATED, ROOT, model, null)
    expect(spawnOneShot).not.toHaveBeenCalled()
  })

  it('routes antigravity through the one-shot spawn with its argv prompt intact', () => {
    const { router, warmSession, spawnOneShot, oneShotChild } = harness()
    const model = asModel('gemini-3-pro')
    const prompt = asArgvPrompt('PREGUNTA')

    const child = router.spawnPrompt(ANTIGRAVITY, VALIDATED, ROOT, model, prompt)

    expect(child).toBe(oneShotChild)
    expect(spawnOneShot).toHaveBeenCalledWith(ANTIGRAVITY, VALIDATED, ROOT, model, prompt)
    expect(warmSession.spawnPrompt).not.toHaveBeenCalled()
  })

  it('routes codex through the one-shot spawn, its null (stdin-delivery) prompt intact', () => {
    const { router, warmSession, spawnOneShot, oneShotChild } = harness()
    const model = asModel('gpt-5.1-codex')

    const child = router.spawnPrompt(CODEX, VALIDATED, ROOT, model, null)

    expect(child).toBe(oneShotChild)
    expect(spawnOneShot).toHaveBeenCalledWith(CODEX, VALIDATED, ROOT, model, null)
    expect(warmSession.spawnPrompt).not.toHaveBeenCalled()
  })

  // `terminate` receives only the handle, so the router must remember which
  // path spawned it: a warm handle killed by the tree kill would orphan the
  // shared process, and a one-shot child sent to the warm session would
  // survive its own cancel.
  it('terminates a warm handle through the warm session, never the one-shot kill', () => {
    const { router, warmSession, terminateOneShot, warmHandle } = harness()
    router.spawnPrompt(CLAUDE, VALIDATED, ROOT, asModel('claude-sonnet-5'), null)

    router.terminate(warmHandle)

    expect(warmSession.terminate).toHaveBeenCalledWith(warmHandle)
    expect(terminateOneShot).not.toHaveBeenCalled()
  })

  it('terminates a one-shot child through the one-shot kill, never the warm session', () => {
    const { router, warmSession, terminateOneShot, oneShotChild } = harness()
    router.spawnPrompt(CODEX, VALIDATED, ROOT, asModel('gpt-5.1-codex'), null)

    router.terminate(oneShotChild)

    expect(terminateOneShot).toHaveBeenCalledWith(oneShotChild)
    expect(warmSession.terminate).not.toHaveBeenCalled()
  })

  // A streaming provider is stdin-delivery by construction (`providerSpec`: a
  // live process cannot be handed a new argv between questions), so a non-null
  // prompt here means a spec changed underneath this invariant. Refused loudly
  // — dropping it is exactly the silent-drop bug this router replaces.
  it('refuses a streaming provider handed an argv prompt instead of dropping it', () => {
    const { router, warmSession, spawnOneShot } = harness()

    expect(() =>
      router.spawnPrompt(CLAUDE, VALIDATED, ROOT, asModel('claude-sonnet-5'), asArgvPrompt('PREGUNTA'))
    ).toThrow(/argv prompt/)
    expect(warmSession.spawnPrompt).not.toHaveBeenCalled()
    expect(spawnOneShot).not.toHaveBeenCalled()
  })

  // Compile-time half of the contract: the router's pair is what belongs on
  // `askService`'s five-argument deps — this assignment failing to typecheck
  // is how the next miswire gets caught before it runs.
  it("satisfies askService's spawn contract exactly", () => {
    const { router } = harness()

    const spawnPrompt: NonNullable<AskServiceDeps['spawnPrompt']> = router.spawnPrompt
    const terminate: NonNullable<AskServiceDeps['terminate']> = router.terminate

    expect(spawnPrompt).toBe(router.spawnPrompt)
    expect(terminate).toBe(router.terminate)
  })
})
