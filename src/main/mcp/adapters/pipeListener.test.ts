import { randomBytes } from 'node:crypto'
import net, { type Socket } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeHello } from '../../../shared/mcp/handshake'
import { MAX_PENDING_HANDSHAKES } from '../domain/handshakeBackoff'
import type { ListenerConnection, ListenerPort, ListenerState } from '../mcpService'
import { createPipeListener, PREAMBLE_TIMEOUT_MS } from './pipeListener'

// Real-socket tests against a temp endpoint (mission scope: this is the ONE
// file besides its own subject allowed to import `node:net`, per the
// `listener-only-in-mcp-slice` guard rule added in this same PR). Every
// timer this module schedules is driven through the repo's established
// dependency-injected `scheduleTimeout`/`clearScheduledTimeout` seam
// (`mcpService.ts`, `askService.ts`, `cliProbeService.ts` precedent) with
// manually-fired captured callbacks — no `vi.useFakeTimers()`, no real
// multi-second sleeps.

const openListeners: ListenerPort[] = []
const openSockets: Socket[] = []

afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.destroy()
  for (const listener of openListeners.splice(0)) listener.close()
})

function testEndpoint(): string {
  const suffix = randomBytes(8).toString('hex')
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\pipelistener-test-${suffix}`
    : path.join(os.tmpdir(), `pipelistener-test-${suffix}.sock`)
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil: condition never became true')
    }
    await new Promise((resolve) => setImmediate(resolve))
  }
}

async function waitForState(listener: ListenerPort, target: ListenerState): Promise<void> {
  await waitUntil(() => listener.state === target)
}

function connectClient(endpoint: string): Promise<Socket> {
  return new Promise((resolve) => {
    const socket = net.connect(endpoint)
    // Real sockets emit 'error' around a server-side destroy/refuse — that is
    // exactly what several tests below provoke on purpose, so an unhandled
    // 'error' here would crash the test for a reason unrelated to what it
    // verifies (mirrors mcpService.test.ts's own FakeSocket precedent).
    socket.on('error', () => {})
    socket.once('connect', () => resolve(socket))
  })
}

interface CapturedTimer {
  callback: () => void
  ms: number
}

function createFakeScheduler(): {
  scheduleTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearScheduledTimeout: (handle: ReturnType<typeof setTimeout>) => void
  scheduled: CapturedTimer[]
} {
  const scheduled: CapturedTimer[] = []
  const handles = new Map<number, CapturedTimer>()
  let nextHandle = 0
  const scheduleTimeout = vi.fn((callback: () => void, ms: number) => {
    const entry: CapturedTimer = { callback, ms }
    scheduled.push(entry)
    const handle = nextHandle++
    handles.set(handle, entry)
    return handle as unknown as ReturnType<typeof setTimeout>
  })
  const clearScheduledTimeout = vi.fn((handle: ReturnType<typeof setTimeout>) => {
    const entry = handles.get(handle as unknown as number)
    if (!entry) return
    const index = scheduled.indexOf(entry)
    if (index !== -1) scheduled.splice(index, 1)
  })
  return { scheduleTimeout, clearScheduledTimeout, scheduled }
}

describe('preamble bounds (task 10.1, threat-matrix)', () => {
  it('destroys a socket whose preamble exceeds 4 KiB with no newline, and never hands it to the port', async () => {
    const { scheduleTimeout, clearScheduledTimeout, scheduled } = createFakeScheduler()
    const onConnection = vi.fn()
    const listener = createPipeListener({ scheduleTimeout, clearScheduledTimeout })
    openListeners.push(listener)
    const endpoint = testEndpoint()
    listener.listen(endpoint, onConnection)
    await waitForState(listener, 'listening')

    const client = await connectClient(endpoint)
    openSockets.push(client)
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()))

    client.write(Buffer.alloc(4096 + 1, 'a'))
    // Oversize is detected synchronously off the 'data' handler — backoff
    // still applies before the socket actually closes (design D10), so fire
    // the scheduled destroy manually rather than waiting on a real timer.
    await waitUntil(() => scheduled.some((timer) => timer.ms === 1000))
    scheduled.find((timer) => timer.ms === 1000)!.callback()

    await closed
    expect(onConnection).not.toHaveBeenCalled()
    // No partial server: the listener itself stays intact after one
    // connection's failure, still able to accept the next one.
    expect(listener.state).toBe('listening')
  })

  it('destroys a socket that never sends a newline within the 5s preamble window, and never hands it to the port', async () => {
    const { scheduleTimeout, clearScheduledTimeout, scheduled } = createFakeScheduler()
    const onConnection = vi.fn()
    const listener = createPipeListener({ scheduleTimeout, clearScheduledTimeout })
    openListeners.push(listener)
    const endpoint = testEndpoint()
    listener.listen(endpoint, onConnection)
    await waitForState(listener, 'listening')

    const client = await connectClient(endpoint)
    openSockets.push(client)
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()))

    client.write('{"token":"still-typing')
    await waitUntil(() => scheduled.some((timer) => timer.ms === PREAMBLE_TIMEOUT_MS))
    scheduled.find((timer) => timer.ms === PREAMBLE_TIMEOUT_MS)!.callback()

    await waitUntil(() => scheduled.some((timer) => timer.ms === 1000))
    scheduled.find((timer) => timer.ms === 1000)!.callback()

    await closed
    expect(onConnection).not.toHaveBeenCalled()
    expect(listener.state).toBe('listening')
  })
})

describe('handshake flood (task 10.2, threat-matrix)', () => {
  it('applies escalating backoff delay across consecutive failing connections', async () => {
    const { scheduleTimeout, clearScheduledTimeout, scheduled } = createFakeScheduler()
    const listener = createPipeListener({ scheduleTimeout, clearScheduledTimeout })
    openListeners.push(listener)
    const endpoint = testEndpoint()
    listener.listen(endpoint, vi.fn())
    await waitForState(listener, 'listening')

    const first = await connectClient(endpoint)
    openSockets.push(first)
    first.destroy()
    await waitUntil(() => scheduled.some((timer) => timer.ms === 1000))
    scheduled.length = 0

    const second = await connectClient(endpoint)
    openSockets.push(second)
    second.destroy()
    await waitUntil(() => scheduled.some((timer) => timer.ms === 2000))
  })

  it(`holds the pending cap at ${MAX_PENDING_HANDSHAKES}, refusing further connections with no port call`, async () => {
    const { scheduleTimeout, clearScheduledTimeout, scheduled } = createFakeScheduler()
    const onConnection = vi.fn()
    const listener = createPipeListener({ scheduleTimeout, clearScheduledTimeout })
    openListeners.push(listener)
    const endpoint = testEndpoint()
    listener.listen(endpoint, onConnection)
    await waitForState(listener, 'listening')

    for (let index = 0; index < MAX_PENDING_HANDSHAKES; index += 1) {
      const pending = await connectClient(endpoint)
      openSockets.push(pending)
    }
    await waitUntil(
      () => scheduled.filter((timer) => timer.ms === PREAMBLE_TIMEOUT_MS).length === MAX_PENDING_HANDSHAKES
    )

    const refused = await connectClient(endpoint)
    openSockets.push(refused)
    const refusedClosed = new Promise<void>((resolve) => refused.once('close', () => resolve()))
    await refusedClosed

    // Refused beyond the cap: never reaches the port at all, so mcpService
    // never sees it and no audit row can possibly exist for it — the cap
    // refusal itself never scheduled a preamble/backoff timer either.
    expect(onConnection).not.toHaveBeenCalled()
    expect(scheduled.filter((timer) => timer.ms === PREAMBLE_TIMEOUT_MS)).toHaveLength(MAX_PENDING_HANDSHAKES)
  })

  it('resets the backoff counter to the base delay after the first successful handshake', async () => {
    const { scheduleTimeout, clearScheduledTimeout, scheduled } = createFakeScheduler()
    const onConnection = vi.fn<(connection: ListenerConnection) => void>()
    const listener = createPipeListener({ scheduleTimeout, clearScheduledTimeout })
    openListeners.push(listener)
    const endpoint = testEndpoint()
    listener.listen(endpoint, onConnection)
    await waitForState(listener, 'listening')

    const failingFirst = await connectClient(endpoint)
    openSockets.push(failingFirst)
    failingFirst.destroy()
    await waitUntil(() => scheduled.some((timer) => timer.ms === 1000))
    scheduled.length = 0

    const failingSecond = await connectClient(endpoint)
    openSockets.push(failingSecond)
    failingSecond.destroy()
    await waitUntil(() => scheduled.some((timer) => timer.ms === 2000))
    scheduled.length = 0

    const succeeding = await connectClient(endpoint)
    openSockets.push(succeeding)
    succeeding.write(encodeHello('any-token'))
    await waitUntil(() => onConnection.mock.calls.length === 1)
    expect(onConnection.mock.calls[0]![0].hello).toEqual({
      present: true,
      hash: expect.any(String)
    })

    const failingThird = await connectClient(endpoint)
    openSockets.push(failingThird)
    failingThird.destroy()
    await waitUntil(() => scheduled.some((timer) => timer.ms === 1000))

    expect(scheduled.some((timer) => timer.ms === 4000)).toBe(false)
  })
})

describe('EADDRINUSE (task 10.3, threat-matrix)', () => {
  it('surfaces address-in-use as listener state error, never throwing', async () => {
    const endpoint = testEndpoint()
    const first = createPipeListener()
    openListeners.push(first)
    first.listen(endpoint, vi.fn())
    await waitForState(first, 'listening')

    const second = createPipeListener()
    openListeners.push(second)
    expect(() => second.listen(endpoint, vi.fn())).not.toThrow()
    await waitForState(second, 'error')

    expect(second.state).toBe('error')
  })

  // Task 14.3: `mcp:status.listenerError` (design "`mcp:*` IPC contract"
  // table) reads this straight from the port — a bare `state: 'error'` alone
  // cannot tell the user WHY (a second app instance vs. anything else).
  it('surfaces the underlying error message, cleared on the next successful listen', async () => {
    const endpoint = testEndpoint()
    const first = createPipeListener()
    openListeners.push(first)
    expect(first.error).toBeNull()
    first.listen(endpoint, vi.fn())
    await waitForState(first, 'listening')

    const second = createPipeListener()
    openListeners.push(second)
    second.listen(endpoint, vi.fn())
    await waitForState(second, 'error')

    expect(second.error).toEqual(expect.any(String))
    expect(second.error).not.toHaveLength(0)
  })
})
