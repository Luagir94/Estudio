import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import type { AskServiceDeps } from '../ask/askService'
import { createWarmPromptSession } from './warmPromptSession'
import {
  clearProvider,
  NO_STREAMING_SESSION_CODE,
  validateModelId,
  type ClearedProvider,
  type ValidatedExecutablePath,
  type ValidatedModelId
} from './claudeExecutableValidator'

// The warm session exists for ONE measured reason: a fresh `-p` spawn costs
// ~15.5s for a trivial question and the CLI itself reports only ~4s of that
// as inference. Everything asserted here protects that saving OR the
// isolation it would otherwise cost — a live process REMEMBERS its turns, so
// the `/clear` before each question is not hygiene, it is what keeps one
// conversation thread out of another.
//
// Every effect is injected, as in `claudeProbeService.test.ts`: no real
// process, no real wait.

const VALIDATED = 'C:\\tools\\claude.exe' as ValidatedExecutablePath
const ROOT = 'C:\\Users\\testuser\\AppData\\Roaming\\course-companion\\attachments'

// Claude is the ONLY provider that reaches this module — it is the only one of
// the three with a duplex stdin a live process can be fed through.
const PROVIDER = clearProvider('claude', null) as ClearedProvider
const MODEL = validateModelId('claude-sonnet-5') as ValidatedModelId
const OTHER_MODEL = validateModelId('claude-haiku-4-5-20251001') as ValidatedModelId

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** One CLI-side `result` event as it arrives on stdout — NDJSON, one per line. */
const resultLine = (text: string): string => JSON.stringify({ type: 'result', subtype: 'success', result: text }) + '\n'

interface FakeSession {
  child: ChildProcess
  stdout: EventEmitter
  stderr: EventEmitter
  writes: string[]
}

function createFakeSession(): FakeSession {
  const emitter = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const writes: string[] = []

  Object.assign(emitter, {
    pid: 7777,
    stdout,
    stderr,
    stdin: {
      write: (chunk: string) => {
        writes.push(chunk)
        return true
      },
      end: vi.fn()
    },
    kill: vi.fn()
  })

  return { child: emitter as unknown as ChildProcess, stdout, stderr, writes }
}

/** The text of the Nth stream-json message the session wrote to the CLI's stdin. */
const sentText = (session: FakeSession, index: number): string =>
  JSON.parse(session.writes[index]).message.content[0].text

function harness(): {
  session: ReturnType<typeof createWarmPromptSession>
  spawnSession: ReturnType<typeof vi.fn>
  sessions: FakeSession[]
  terminateSession: ReturnType<typeof vi.fn>
} {
  const sessions: FakeSession[] = []
  const spawnSession = vi.fn(() => {
    const fake = createFakeSession()
    sessions.push(fake)
    return fake.child
  })
  const terminateSession = vi.fn()
  const session = createWarmPromptSession({ spawnSession, terminateSession, logger: { info: vi.fn() } })
  return { session, spawnSession, sessions, terminateSession }
}

/** Drives one full question against the warm session, returning what the caller observed. */
async function askOnce(
  session: ReturnType<typeof createWarmPromptSession>,
  fakes: FakeSession[],
  prompt: string,
  answer: string
): Promise<{ stdout: string; exitCode: number | null }> {
  const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)
  let stdout = ''
  handle.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
  })
  const closed = new Promise<number | null>((resolve) => handle.once('close', resolve))

  handle.stdin?.write(prompt)
  handle.stdin?.end()
  await tick()

  const fake = fakes[fakes.length - 1]
  fake.stdout.emit('data', resultLine('')) // the `/clear` settles
  await tick()
  fake.stdout.emit('data', resultLine(answer))

  return { stdout, exitCode: await closed }
}

describe('createWarmPromptSession', () => {
  it('serves a second question from the SAME process instead of spawning again', async () => {
    const { session, spawnSession, sessions } = harness()

    await askOnce(session, sessions, 'PRIMERA', '{"kind":"general","answer":"a"}')
    await askOnce(session, sessions, 'SEGUNDA', '{"kind":"general","answer":"b"}')

    expect(spawnSession).toHaveBeenCalledTimes(1)
  })

  // The whole isolation guarantee. A live process REMEMBERS: without this,
  // question two of thread B would be answered with thread A still in
  // context. Verified against the real CLI — `/clear` costs ~21ms and the
  // planted fact is genuinely gone afterwards.
  it('sends /clear BEFORE every question, including the first', async () => {
    const { session, sessions } = harness()

    await askOnce(session, sessions, 'PRIMERA', '{"kind":"general","answer":"a"}')
    await askOnce(session, sessions, 'SEGUNDA', '{"kind":"general","answer":"b"}')

    const [fake] = sessions
    expect(sentText(fake, 0)).toBe('/clear')
    expect(sentText(fake, 1)).toBe('PRIMERA')
    expect(sentText(fake, 2)).toBe('/clear')
    expect(sentText(fake, 3)).toBe('SEGUNDA')
  })

  it('holds the question back until the /clear has actually settled', async () => {
    const { session, sessions } = harness()
    const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)

    handle.stdin?.write('PREGUNTA')
    handle.stdin?.end()
    await tick()

    // Only the clear so far — sending the question now would land it in a
    // context that has not been wiped yet.
    expect(sessions[0].writes).toHaveLength(1)
    expect(sentText(sessions[0], 0)).toBe('/clear')
  })

  it('forwards the CLI result line to the caller and closes with 0', async () => {
    const { session, sessions } = harness()

    const { stdout, exitCode } = await askOnce(session, sessions, 'PREGUNTA', '{"kind":"general","answer":"hola"}')

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.trim()).result).toBe('{"kind":"general","answer":"hola"}')
  })

  // The model is fixed at spawn, so a picker change cannot be honoured by the
  // live process — reusing it would silently answer with the previous model.
  it('replaces the process when the model changes, and reuses it when it does not', async () => {
    const { session, spawnSession, sessions, terminateSession } = harness()

    await askOnce(session, sessions, 'A', '{"kind":"general","answer":"a"}')
    await tick()

    session.spawnPrompt(PROVIDER, VALIDATED, ROOT, OTHER_MODEL)

    expect(spawnSession).toHaveBeenCalledTimes(2)
    expect(terminateSession).toHaveBeenCalledWith(sessions[0].child)
    expect(spawnSession.mock.calls[1]).toEqual([PROVIDER, VALIDATED, ROOT, OTHER_MODEL])
  })

  it('reports a spawn failure on the handle with the CLI-not-found code intact', async () => {
    const spawnSession = vi.fn(() => {
      const error: NodeJS.ErrnoException = new Error('nope')
      error.code = 'ENOENT'
      throw error
    })
    const session = createWarmPromptSession({ spawnSession, terminateSession: vi.fn(), logger: { info: vi.fn() } })

    const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)
    const failure = new Promise<NodeJS.ErrnoException>((resolve) => handle.once('error', resolve))

    handle.stdin?.write('PREGUNTA')
    handle.stdin?.end()

    expect((await failure).code).toBe('ENOENT')
  })

  // A dead warm process must NOT swallow the question: the caller has to see
  // a close it can map to a typed error, exactly as with a per-question spawn.
  it('closes the pending handle with the exit code when the process dies mid-turn', async () => {
    const { session, sessions } = harness()
    const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)
    const closed = new Promise<number | null>((resolve) => handle.once('close', resolve))

    handle.stdin?.write('PREGUNTA')
    handle.stdin?.end()
    await tick()
    sessions[0].child.emit('close', 1)

    expect(await closed).toBe(1)
  })

  it('forwards stderr so a failing turn keeps its detail line', async () => {
    const { session, sessions } = harness()
    const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)
    let stderr = ''
    handle.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    handle.stdin?.write('PREGUNTA')
    handle.stdin?.end()
    await tick()
    sessions[0].stderr.emit('data', 'algo se rompio')

    expect(stderr).toBe('algo se rompio')
  })

  it('drops the process on terminate, so the next question starts a fresh one', async () => {
    const { session, spawnSession, sessions, terminateSession } = harness()
    const handle = session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)

    handle.stdin?.write('PREGUNTA')
    handle.stdin?.end()
    await tick()
    session.terminate(handle)

    expect(terminateSession).toHaveBeenCalledWith(sessions[0].child)

    session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)
    expect(spawnSession).toHaveBeenCalledTimes(2)
  })

  // Warm-up is the other half of the saving: without it the FIRST question of
  // every app launch still pays the full boot.
  it('warms up without a question, and the first question reuses that process', async () => {
    const { session, spawnSession, sessions } = harness()

    session.warmUp(PROVIDER, VALIDATED, ROOT, MODEL)
    expect(spawnSession).toHaveBeenCalledTimes(1)

    await askOnce(session, sessions, 'PREGUNTA', '{"kind":"general","answer":"a"}')
    expect(spawnSession).toHaveBeenCalledTimes(1)
  })

  it('never leaves a process behind on dispose', () => {
    const { session, sessions, terminateSession } = harness()

    session.warmUp(PROVIDER, VALIDATED, ROOT, MODEL)
    session.dispose()

    expect(terminateSession).toHaveBeenCalledWith(sessions[0].child)
  })

  // The composition root once wired this Claude-only session as the spawn dep
  // for EVERY provider. For an argv provider that meant the turn never started
  // (nothing was ever written to the handle's stdin), so the swallowed
  // no-streaming-mode refusal left a healthy-looking handle that hung the
  // question to its five-minute timeout. That exact refusal must escape
  // synchronously; every OTHER failure keeps the deferred report the ENOENT
  // test above pins.
  it('rethrows the no-streaming-mode refusal instead of returning a fake healthy handle', () => {
    const spawnSession = vi.fn(() => {
      const refusal: NodeJS.ErrnoException = new Error('antigravity has no streaming session mode')
      refusal.code = NO_STREAMING_SESSION_CODE
      throw refusal
    })
    const session = createWarmPromptSession({ spawnSession, terminateSession: vi.fn(), logger: { info: vi.fn() } })

    expect(() => session.spawnPrompt(PROVIDER, VALIDATED, ROOT, MODEL)).toThrow(/no streaming session mode/)
  })

  // The other half of the same regression guard, at compile time: `askService`
  // hands its spawn dep FIVE arguments, the fifth being the argv prompt, and
  // this session's four-argument shape used to be silently assignable — the
  // prompt just vanished. The signature now admits only `null` there, so the
  // raw wiring is a type error and `createPromptSpawnRouter` is the one
  // sanctioned adapter.
  it("cannot be wired raw where askService's five-argument spawn contract is expected", () => {
    const { session } = harness()

    // @ts-expect-error — the warm session never receives an argv prompt; wire it through createPromptSpawnRouter.
    const miswired: NonNullable<AskServiceDeps['spawnPrompt']> = session.spawnPrompt

    expect(miswired).toBe(session.spawnPrompt)
  })

  // Same rule as every other spawn in this app: user text reaches the CLI
  // through stdin as a stream-json message, never as an argument.
  it('passes the question through stdin only, never to the spawn call', async () => {
    const { session, spawnSession, sessions } = harness()

    await askOnce(session, sessions, 'texto peligroso', '{"kind":"general","answer":"a"}')

    expect(spawnSession).toHaveBeenCalledWith(PROVIDER, VALIDATED, ROOT, MODEL)
    expect(JSON.stringify(spawnSession.mock.calls)).not.toContain('peligroso')
  })
})
