import { Duplex } from 'node:stream'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTool } from '../domain/toolDescriptor'

const logErrorMock = vi.hoisted(() => vi.fn())
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { createConnectionMcpServer, createConnectionState, createToolHandler } from './mcpServerFactory'

// --- Task 3.2: protocol-version pin -------------------------------------

describe('SUPPORTED_PROTOCOL_VERSIONS pin (design D3)', () => {
  it('still negotiates the 2025-06-18 revision this design targets', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('2025-06-18')
  })
})

// --- Task 3.3: Spike A ---------------------------------------------------
//
// A pipe/socket connection (design D1/D8) is ONE object serving as both the
// readable and writable end, unlike process.stdin/process.stdout, which are
// two separate globals. This spike proves the SDK's stdio transport accepts
// that shape directly, so mcpService (PR9/PR10) can hand it a live socket
// with no adapter in between.
//
// RESULT: PASSES against installed 1.30.0 (StdioServerTransport's
// constructor is typed `(stdin?: Readable, stdout?: Writable, ...)` with no
// special-casing of the process globals) — the design's fallback
// `socketTransport.ts` (Open Questions) is NOT implemented in this PR.

class TestDuplexSocket extends Duplex {
  written: Buffer[] = []

  override _read(): void {
    // Data arrives only via an explicit .push() call from the test below.
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.written.push(chunk)
    callback()
  }
}

describe('StdioServerTransport over a duplex-stream pair (Spike A)', () => {
  it('accepts the SAME duplex object as both the readable and writable end, not just process.stdin/stdout', async () => {
    const socket = new TestDuplexSocket()
    const transport = new StdioServerTransport(socket, socket)
    const received: unknown[] = []
    transport.onmessage = (message) => received.push(message)

    await transport.start()
    socket.push(`${JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(received).toEqual([{ jsonrpc: '2.0', method: 'ping', id: 1 }])

    await transport.send({ jsonrpc: '2.0', method: 'notifications/ping' })
    expect(Buffer.concat(socket.written).toString('utf8')).toBe(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/ping' })}\n`
    )
  })
})

// --- Tasks 3.4-3.7: the defineTool wrapper --------------------------------

type DetailInput = { id: number }
type DetailResult = { id: number }

function buildDetailDescriptor(exec: (input: DetailInput) => Promise<DetailResult | null> | DetailResult | null) {
  return defineTool({
    name: 'materias_detail',
    slice: 'materias',
    action: 'read',
    description: 'Reads a subject by id.',
    inputSchema: z.object({ id: z.number().int().positive() }),
    exec,
    summarize: (input, result) =>
      result ? `materias_detail id=${input.id}` : `materias_detail id=${input.id}: not found`
  })
}

describe('createToolHandler — stale -> authorize -> parse -> exec -> envelope -> audit order', () => {
  it('returns SESSION_TERMINATED and audits denied without calling authorize or exec when the connection is stale', async () => {
    const exec = vi.fn()
    const authorize = vi.fn()
    const audit = vi.fn()
    const connection = createConnectionState()
    connection.stale = true
    const handler = createToolHandler(buildDetailDescriptor(exec), connection, { authorize, audit })

    const result = await handler({ id: 1 })

    expect(authorize).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      code: 'SESSION_TERMINATED',
      message: 'SESSION_TERMINATED'
    })
    expect(audit).toHaveBeenCalledWith({
      tool: 'materias_detail',
      slice: 'materias',
      action: 'read',
      outcome: 'denied',
      summary: 'denied: materias read, session terminated'
    })
  })

  it('returns PERMISSION_DENIED, audits denied, and never calls exec when the slice/action is not granted (spec: a denied call never executes)', async () => {
    const exec = vi.fn()
    const audit = vi.fn()
    const connection = createConnectionState()
    const handler = createToolHandler(buildDetailDescriptor(exec), connection, { authorize: () => false, audit })

    const result = await handler({ id: 1 })

    expect(exec).not.toHaveBeenCalled()
    expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('PERMISSION_DENIED')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', summary: 'denied: materias read not granted' })
    )
  })

  it('denies the very next call once a grant is withdrawn mid-connection, with no reconnect required (task 3.6)', async () => {
    const exec = vi.fn().mockResolvedValue({ id: 1 })
    let granted = true
    const connection = createConnectionState()
    const handler = createToolHandler(buildDetailDescriptor(exec), connection, {
      authorize: () => granted,
      audit: vi.fn()
    })

    await handler({ id: 1 })
    expect(exec).toHaveBeenCalledTimes(1)

    granted = false
    const denied = await handler({ id: 1 })

    expect(exec).toHaveBeenCalledTimes(1)
    expect(JSON.parse((denied.content[0] as { text: string }).text).code).toBe('PERMISSION_DENIED')
  })

  it('rejects input that satisfies the SDK-rebuilt shape but violates an object-level refinement, before exec runs (task 3.5 — the double parse is load-bearing)', async () => {
    // Mirrors real cases in this repo (shared/ipc/carreras.ts's
    // refineSchemeAndScale, shared/ipc/fechas.ts's endsOn.beforeStart): every
    // FIELD below is individually valid, but the SDK only ever sees
    // `descriptor.inputSchema.shape` (the raw per-field schemas) when it
    // rebuilds its own `z.object(shape)` validator — it drops this
    // `.superRefine`. Only re-parsing against the FULL `descriptor.inputSchema`
    // here catches it. If this second `parsePayload` call were ever removed
    // as a "simplification", this exact test would start passing bad input
    // through to `exec`.
    const inputSchema = z.object({ startsOn: z.string(), endsOn: z.string().nullable() }).superRefine((value, ctx) => {
      if (value.endsOn && value.endsOn < value.startsOn) {
        ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'endsOn.beforeStart' })
      }
    })
    const exec = vi.fn()
    const descriptor = defineTool({
      name: 'fechas_create',
      slice: 'fechas',
      action: 'write',
      effect: 'create',
      description: 'Creates an academic date.',
      inputSchema,
      exec,
      summarize: () => 'fechas_create'
    })
    const connection = createConnectionState()
    const handler = createToolHandler(descriptor, connection, { authorize: () => true, audit: vi.fn() })

    const result = await handler({ startsOn: '2026-09-10', endsOn: '2026-09-01' })

    expect(exec).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(JSON.parse((result.content[0] as { text: string }).text).message).toContain('endsOn.beforeStart')
  })

  it('returns NOT_FOUND and audits outcome=error when exec resolves null, mirroring the IPC handlers own convention', async () => {
    const audit = vi.fn()
    const connection = createConnectionState()
    const handler = createToolHandler(
      buildDetailDescriptor(() => null),
      connection,
      { authorize: () => true, audit }
    )

    const result = await handler({ id: 9 })

    expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('NOT_FOUND')
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'error', summary: 'materias_detail id=9: not found' })
    )
  })

  it('returns TOOL_FAILED, logs the failure, and audits outcome=error when exec throws', async () => {
    const audit = vi.fn()
    const connection = createConnectionState()
    const handler = createToolHandler(
      buildDetailDescriptor(() => {
        throw new Error('repository unavailable')
      }),
      connection,
      { authorize: () => true, audit }
    )

    const result = await handler({ id: 1 })

    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      code: 'TOOL_FAILED',
      message: 'repository unavailable'
    })
    expect(logErrorMock).toHaveBeenCalledWith('mcp tool materias_detail failed', expect.any(Error))
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error' }))
  })

  it('returns the success envelope and audits outcome=success on a successful call', async () => {
    const audit = vi.fn()
    const connection = createConnectionState()
    const handler = createToolHandler(
      buildDetailDescriptor(() => ({ id: 4 })),
      connection,
      {
        authorize: () => true,
        audit
      }
    )

    const result = await handler({ id: 4 })

    expect(result.isError).toBeUndefined()
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ id: 4 }) }])
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'materias_detail', outcome: 'success', summary: 'materias_detail id=4' })
    )
  })

  it('lets an in-flight call settle and return BEFORE a NEW call is rejected once the connection turns stale mid-flight (task 3.7 — rotate/revoke drain)', async () => {
    let resolveExec!: (value: DetailResult) => void
    const exec = vi.fn(() => new Promise<DetailResult>((resolve) => (resolveExec = resolve)))
    const connection = createConnectionState()
    const settle = vi.fn()
    connection.settle = settle
    const handler = createToolHandler(buildDetailDescriptor(exec), connection, {
      authorize: () => true,
      audit: vi.fn()
    })

    const inFlight = handler({ id: 1 })
    await Promise.resolve()
    expect(connection.inFlightCount).toBe(1)

    // mcpService (PR9) marks the connection stale mid-call on rotate/revoke.
    connection.stale = true
    const rejectedOnStale = await handler({ id: 1 })
    expect(JSON.parse((rejectedOnStale.content[0] as { text: string }).text).code).toBe('SESSION_TERMINATED')

    resolveExec({ id: 1 })
    const settled = await inFlight

    expect(settled.isError).toBeUndefined()
    expect(JSON.parse((settled.content[0] as { text: string }).text)).toEqual({ id: 1 })
    expect(connection.inFlightCount).toBe(0)
    expect(settle).toHaveBeenCalledTimes(1)
  })
})

// --- Spike B fallback (PR5 task 5.1): advertisedShapeOverrides -----------
//
// Installed 1.30.0 drops a `z.preprocess`-backed REQUIRED field from the
// advertised `tools/list` JSON schema's `required` array (verified in
// `materiasTools.test.ts`'s Spike B test against `materias_create`'s real
// `periodId` field). This decoupled override restores it: it is applied
// ONLY to the raw shape handed to the SDK for advertising, never to
// `descriptor.inputSchema` itself, so `createToolHandler`'s double parse
// keeps validating the exact, unmodified contract.
describe('createConnectionMcpServer — advertisedShapeOverrides (Spike B fallback, task 5.1)', () => {
  function buildProbeDescriptor() {
    return defineTool({
      name: 'probe_tool',
      slice: 'materias',
      action: 'write',
      effect: 'update',
      description: 'Probes the advertised-shape override.',
      inputSchema: z.object({ id: z.preprocess((value) => value, z.number().int().positive()) }),
      advertisedShapeOverrides: { id: z.unknown() },
      exec: vi.fn().mockResolvedValue({ id: 1 }),
      summarize: () => 'probe_tool'
    })
  }

  it('advertises the overridden field as required with a looser (untyped) JSON schema', async () => {
    const { server } = createConnectionMcpServer([buildProbeDescriptor()], { authorize: () => true, audit: vi.fn() })
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'probe-client', version: '0.0.0' })

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    const { tools } = await client.listTools()
    const [probeTool] = tools
    if (!probeTool) {
      throw new Error('expected the probe tool to be registered')
    }

    expect(probeTool.inputSchema.required).toContain('id')
    expect(probeTool.inputSchema.properties?.id).toEqual({})
  })

  it('leaves real validation completely unaffected — a missing field still fails the double parse', async () => {
    const audit = vi.fn()
    const connection = createConnectionState()
    const handler = createToolHandler(buildProbeDescriptor(), connection, { authorize: () => true, audit })

    const result = await handler({})

    expect(result.isError).toBe(true)
    expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid' }))
  })
})

describe('createConnectionMcpServer — wiring through the real SDK', () => {
  it('registers each descriptor as a tool and dispatches tools/call through the wrapper', async () => {
    const exec = vi.fn().mockResolvedValue({ id: 7 })
    const audit = vi.fn()
    const { server, connection } = createConnectionMcpServer([buildDetailDescriptor(exec)], {
      authorize: () => true,
      audit
    })
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-client', version: '0.0.0' })

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(['materias_detail'])

    const result = await client.callTool({ name: 'materias_detail', arguments: { id: 7 } })

    expect(exec).toHaveBeenCalledWith({ id: 7 })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ id: 7 }) }])
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', tool: 'materias_detail' }))
    expect(connection.inFlightCount).toBe(0)
  })
})
