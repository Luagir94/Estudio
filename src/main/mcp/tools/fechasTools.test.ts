import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  AcademicDateRecord,
  AcademicDateWithProgram,
  CreateAcademicDateInput,
  DeleteAcademicDateResult,
  UpdateAcademicDateInput
} from '../../../shared/ipc/fechas'
import type { AcademicDateRepository } from '../../fechas/adapters/sqliteAcademicDateRepository'
import { createConnectionMcpServer, createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createFechasTools } from './fechasTools'

// Sentinel marker standing in for a free-text field (title…) that must NEVER
// survive into a built audit summary — same threat pattern as
// `materiasTools.test.ts` (PR5), `carrerasTools.test.ts` (PR6) and
// `entregasTools.test.ts` (PR7), proven here against the real `fechas_*`
// `summarize` callbacks (task 7.2).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<AcademicDateRepository> = {}): AcademicDateRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    listByProgram: vi.fn(() => []),
    update: vi.fn(() => null),
    remove: vi.fn(() => false),
    ...overrides
  }
}

function buildCreateInput(): CreateAcademicDateInput {
  return {
    programId: 2,
    title: 'Inscripción a finales',
    kind: 'inscripcionFinales',
    startsOn: '2026-11-01',
    endsOn: null
  }
}

describe('createFechasTools', () => {
  it('fechas_list reads through repository.list and summarizes a row count only', async () => {
    const rows = [{ id: 1 }, { id: 2 }] as unknown as AcademicDateWithProgram[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createFechasTools({ repository })
    if (!tool) {
      throw new Error('expected createFechasTools to return at least one tool')
    }

    const result = await tool.exec({})

    expect(repository.list).toHaveBeenCalledOnce()
    expect(result).toEqual({ items: rows, total: 2, count: 2, offset: 0, hasMore: false, nextOffset: null })
    expect(tool.summarize({}, result)).toBe(`fechas_list → 2 of 2 rows`)
    expect(tool.name).toBe('fechas_list')
    expect(tool.slice).toBe('fechas')
    expect(tool.action).toBe('read')
  })

  it('fechas_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as AcademicDateRecord
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createFechasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'fechas_create')!
    const input = buildCreateInput()

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('fechas_create → id=12')
    expect(tool.action).toBe('write')
  })

  it('fechas_update writes through repository.update and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 7 } as unknown as AcademicDateRecord
    const repository = fakeRepository({ update: vi.fn(() => updated) })
    const tools = createFechasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'fechas_update')!
    const input: UpdateAcademicDateInput = {
      id: 7,
      title: 'Vencimiento regularidad',
      kind: 'vencimientoRegularidad',
      startsOn: '2026-12-01',
      endsOn: null
    }

    const result = await tool.exec(input)

    expect(repository.update).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('fechas_update id=7')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('fechas_update id=9: not found')
  })

  it('fechas_delete writes through repository.remove and reports NOT_FOUND identifiers only', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => true) })
    const tools = createFechasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'fechas_delete')!
    const expected: DeleteAcademicDateResult = { id: 3 }

    const result = await tool.exec({ id: 3 })

    expect(repository.remove).toHaveBeenCalledWith(3)
    expect(result).toEqual(expected)
    expect(tool.summarize({ id: 3 }, expected)).toBe('fechas_delete id=3')
    expect(tool.action).toBe('write')
  })

  it('fechas_delete summarizes NOT_FOUND when repository.remove returns false', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => false) })
    const tools = createFechasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'fechas_delete')!

    const result = await tool.exec({ id: 9 })

    expect(result).toBeNull()
    expect(tool.summarize({ id: 9 }, null)).toBe('fechas_delete id=9: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createFechasTools({ repository: fakeRepository() })
    const create = tools.find((candidate) => candidate.name === 'fechas_create')!
    const update = tools.find((candidate) => candidate.name === 'fechas_update')!

    const createSummary = create.summarize(
      { programId: 1, title: SENTINEL, kind: 'otro', startsOn: '2026-01-01', endsOn: null },
      { id: 1 } as unknown as AcademicDateRecord
    )
    const updateSummary = update.summarize(
      { id: 1, title: SENTINEL, kind: 'otro', startsOn: '2026-01-01', endsOn: null },
      { id: 1 } as unknown as AcademicDateRecord
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
  })

  // --- Task 7.2: preprocess audit (Spike B follow-up, PR5/PR6 precedent) ---
  //
  // `shared/ipc/fechas.ts` has exactly ONE `z.preprocess` field: `endsOn`
  // (`optionalEndDate`, used by both `createAcademicDateInputSchema` and
  // `updateAcademicDateInputSchema`). Like carreras' `institution` field
  // (PR6), it is genuinely OPTIONAL — `.nullable().default(null)` — so it
  // belongs OUTSIDE the advertised `required` array regardless of the SDK's
  // "drops a REQUIRED preprocess field" rendering quirk (PR5's Spike B). This
  // test proves the installed SDK renders every REAL required field of
  // `fechas_create` correctly and correctly excludes `endsOn`, confirming NO
  // `advertisedShapeOverrides` is needed anywhere in this tool module.
  describe('tools/list JSON-schema rendering (preprocess audit, task 7.2 — no override needed)', () => {
    it('fechas_create advertises every required field and excludes the optional preprocess-backed endsOn', async () => {
      const { server } = createConnectionMcpServer(createFechasTools({ repository: fakeRepository() }), {
        authorize: () => true,
        audit: vi.fn()
      })
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'fechas-preprocess-audit-client', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const fechasCreate = tools.find((tool) => tool.name === 'fechas_create')!

      expect(fechasCreate.inputSchema.required).toEqual(
        expect.arrayContaining(['programId', 'title', 'kind', 'startsOn'])
      )
      // `endsOn` is the ONE preprocess field in this schema, and it is
      // genuinely optional — it must NOT be required, with or without the
      // SDK's rendering quirk.
      expect(fechasCreate.inputSchema.required).not.toContain('endsOn')
    })
  })

  // --- Threat-matrix parity with PR5 task 5.4 / PR6 task 6.1: invalid input
  // never reaches the repository -------------------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects a fechas_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createFechasTools({ repository })
      const createTool = tools.find((candidate) => candidate.name === 'fechas_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `title` is required by `createAcademicDateInputSchema` and omitted here.
      const result = await handler({ programId: 1, kind: 'otro', startsOn: '2026-01-01' })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'fechas_create' }))
    })
  })
})
