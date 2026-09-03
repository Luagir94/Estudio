import { Duplex, PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeHello } from '../shared/mcp/handshake'
import {
  ACK_TIMEOUT_MESSAGE,
  ACK_TIMEOUT_MS,
  CONNECTION_CLOSED_MESSAGE,
  MCP_TOKEN_ENV_VAR,
  NOT_RUNNING_MESSAGE,
  runRelay,
  TOKEN_REJECTED_MESSAGE
} from './relay'

// `relay.ts` never references `process` (design "Module Layout"): every
// collaborator here is a plain Node stream or a fake, exactly what makes
// this file runnable under Vitest with no real named pipe and no real
// child process. `index.ts` is the only file that supplies the real ones.

/** A controllable stand-in for the internal-leg socket `connect()` returns: captures every write relay.ts makes, and lets a test push bytes "from the app" or simulate an error/close. */
class FakeSocket extends Duplex {
  written: Buffer[] = []

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.written.push(Buffer.from(chunk))
    callback()
  }

  _read(): void {
    // no-op — data only ever arrives via an explicit `push` call below
  }
}

function collectText(stream: PassThrough): { text: string } {
  const box = { text: '' }
  stream.on('data', (chunk: Buffer) => {
    box.text += chunk.toString('utf8')
  })
  return box
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

const TOKEN = 'cc_test-token'

function buildHarness() {
  const socket = new FakeSocket()
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdoutBox = collectText(stdout)
  const stderrBox = collectText(stderr)
  const exit = vi.fn()
  const connect = vi.fn(() => socket as Duplex)
  return { socket, stdin, stdout, stderr, stdoutBox, stderrBox, exit, connect }
}

function run(harness: ReturnType<typeof buildHarness>): void {
  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    connect: harness.connect,
    env: { [MCP_TOKEN_ENV_VAR]: TOKEN },
    exit: harness.exit
  })
}

describe('runRelay', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the hello line to the socket immediately, before any ack is received', () => {
    const harness = buildHarness()
    run(harness)

    expect(harness.socket.written).toHaveLength(1)
    expect(harness.socket.written[0]!.toString('utf8')).toBe(encodeHello(TOKEN))
  })

  it('relays stdin to the socket and the socket to stdout byte-exact once the ack succeeds', async () => {
    const harness = buildHarness()
    run(harness)

    harness.socket.push('{"ok":true}\n')
    await flush()

    const clientMessage = '{"jsonrpc":"2.0","method":"tools/list","id":1}\n'
    harness.stdin.write(clientMessage)
    await flush()

    expect(harness.socket.written).toHaveLength(2)
    expect(harness.socket.written[1]!.toString('utf8')).toBe(clientMessage)

    const serverMessage = '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n'
    harness.socket.push(serverMessage)
    await flush()

    expect(harness.stdoutBox.text).toBe(serverMessage)
    expect(harness.stderrBox.text).toBe('')
    expect(harness.exit).not.toHaveBeenCalled()
  })

  it('buffers stdin written before the ack arrives and relays it in order right after the handshake', async () => {
    const harness = buildHarness()
    run(harness)

    const earlyMessage = 'EARLY-JSONRPC-LINE\n'
    harness.stdin.write(earlyMessage)
    await flush()

    // Not relayed yet — only the hello line has reached the socket. This is
    // the threat-matrix case "client sends JSON-RPC before ack": losing or
    // interleaving that data with the hello line would corrupt the wire.
    expect(harness.socket.written).toHaveLength(1)

    harness.socket.push('{"ok":true}\n')
    await flush()

    expect(harness.socket.written).toHaveLength(2)
    expect(harness.socket.written[1]!.toString('utf8')).toBe(earlyMessage)
  })

  it('exits 0 when stdin ends after a successful handshake', async () => {
    const harness = buildHarness()
    run(harness)

    harness.socket.push('{"ok":true}\n')
    await flush()

    harness.stdin.end()
    await flush()

    expect(harness.exit).toHaveBeenCalledWith(0)
    expect(harness.stderrBox.text).toBe('')
  })

  it('exits 1 and writes only to stderr when the app rejects the token', async () => {
    const harness = buildHarness()
    run(harness)

    harness.socket.push('{"ok":false,"reason":"unauthorized"}\n')
    await flush()

    expect(harness.exit).toHaveBeenCalledWith(1)
    expect(harness.stderrBox.text).toContain(TOKEN_REJECTED_MESSAGE)
    expect(harness.stdoutBox.text).toBe('')
  })

  it('exits 1 with a not-running message when connect() throws synchronously', () => {
    const harness = buildHarness()
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    harness.connect.mockImplementation(() => {
      throw enoent
    })

    run(harness)

    expect(harness.exit).toHaveBeenCalledWith(1)
    expect(harness.stderrBox.text).toContain(NOT_RUNNING_MESSAGE)
    expect(harness.stdoutBox.text).toBe('')
  })

  it('exits 1 with a not-running message when the socket errors before the handshake completes', async () => {
    const harness = buildHarness()
    run(harness)

    harness.socket.emit('error', Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    await flush()

    expect(harness.exit).toHaveBeenCalledWith(1)
    expect(harness.stderrBox.text).toContain(NOT_RUNNING_MESSAGE)
    expect(harness.stdoutBox.text).toBe('')
  })

  it('exits 1 with a connection-closed message when the socket closes mid-session, after a successful handshake', async () => {
    const harness = buildHarness()
    run(harness)

    harness.socket.push('{"ok":true}\n')
    await flush()

    harness.socket.emit('close')
    await flush()

    expect(harness.exit).toHaveBeenCalledWith(1)
    expect(harness.stderrBox.text).toContain(CONNECTION_CLOSED_MESSAGE)
    expect(harness.stdoutBox.text).toBe('')
  })

  it('exits 1 with a timeout message when the app never sends an ack', () => {
    vi.useFakeTimers()
    const harness = buildHarness()
    run(harness)

    vi.advanceTimersByTime(ACK_TIMEOUT_MS)

    expect(harness.exit).toHaveBeenCalledWith(1)
    expect(harness.stderrBox.text).toContain(ACK_TIMEOUT_MESSAGE)
  })
})
