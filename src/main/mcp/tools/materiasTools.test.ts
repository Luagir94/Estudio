import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  CreateSubjectInput,
  DeleteSubjectResult,
  SetSubjectOutcomeInput,
  SubjectWithSlots,
  SubjectWithStatus,
  UpdateSubjectScheduleInput
} from '../../../shared/ipc/materias'
import type { MateriasService } from '../../materias/materiasService'
import type { SubjectRepository, SubjectWithDetail } from '../../materias/adapters/sqliteSubjectRepository'
import { createConnectionMcpServer, createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createMateriasTools } from './materiasTools'

// Sentinel marker standing in for a free-text field (name, docente, notas…)
// that must NEVER survive into a built audit summary — the same threat this
// change's `auditEntry.test.ts` fixture already covers generically; here it
// is proven against the REAL `materias_*` `summarize` callbacks (task 5.2).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<SubjectRepository> = {}): SubjectRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    detail: vi.fn(() => null),
    updateSchedule: vi.fn(),
    remove: vi.fn(),
    setOutcome: vi.fn(() => null),
    ...overrides
  }
}

function fakeMateriasService(overrides: Partial<MateriasService> = {}): MateriasService {
  return {
    deleteSubject: vi.fn(),
    ...overrides
  }
}

function buildSlots(): CreateSubjectInput['slots'] {
  return [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540, location: null }]
}

describe('createMateriasTools', () => {
  it('materias_list reads through repository.list and summarizes a row count only', async () => {
    const rows = [{ id: 1 }, { id: 2 }] as unknown as SubjectWithStatus[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createMateriasTools({ repository, materiasService: fakeMateriasService() })
    if (!tool) {
      throw new Error('expected createMateriasTools to return at least one tool')
    }

    const result = await tool.exec({})

    expect(repository.list).toHaveBeenCalledOnce()
    expect(result).toEqual({ items: rows, total: 2, count: 2, offset: 0, hasMore: false, nextOffset: null })
    expect(tool.summarize({}, result)).toBe(`materias_list → 2 of 2 rows`)
    expect(tool.name).toBe('materias_list')
    expect(tool.slice).toBe('materias')
    expect(tool.action).toBe('read')
  })

  it('materias_list walks the whole collection through nextOffset, with no gap and no repeat', async () => {
    // The behaviour a paging contract actually promises: feed `nextOffset`
    // back as `offset` and you eventually see every row exactly once, and the
    // last page says so.
    const rows = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 })) as unknown as SubjectWithStatus[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createMateriasTools({ repository, materiasService: fakeMateriasService() })

    const first = (await tool!.exec({ limit: 3 })) as { items: unknown[]; nextOffset: number | null; total: number }
    const second = (await tool!.exec({ limit: 3, offset: first.nextOffset! })) as typeof first
    const third = (await tool!.exec({ limit: 3, offset: second.nextOffset! })) as typeof first

    expect([...first.items, ...second.items, ...third.items]).toEqual(rows)
    expect(first.total).toBe(7)
    expect(third.nextOffset).toBeNull()
    expect(tool!.summarize({ limit: 3 }, third)).toBe('materias_list → 1 of 7 rows')
  })

  it('materias_detail reads through repository.detail and reports NOT_FOUND identifiers only', async () => {
    const detail = { id: 5 } as unknown as SubjectWithDetail
    const repository = fakeRepository({ detail: vi.fn(() => detail) })
    const tools = createMateriasTools({ repository, materiasService: fakeMateriasService() })
    const tool = tools.find((candidate) => candidate.name === 'materias_detail')!

    const result = await tool.exec({ id: 5 })

    expect(repository.detail).toHaveBeenCalledWith(5)
    expect(result).toBe(detail)
    expect(tool.summarize({ id: 5 }, detail)).toBe('materias_detail id=5')
    expect(tool.summarize({ id: 9 }, null)).toBe('materias_detail id=9: not found')
    expect(tool.action).toBe('read')
  })

  it('materias_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as SubjectWithSlots
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createMateriasTools({ repository, materiasService: fakeMateriasService() })
    const tool = tools.find((candidate) => candidate.name === 'materias_create')!
    const input: CreateSubjectInput = {
      name: 'Análisis Matemático',
      code: 'AM1',
      color: '#fff',
      docente: null,
      contacto: null,
      periodId: 3,
      nivel: null,
      slots: buildSlots()
    }

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('materias_create → id=12')
    expect(tool.action).toBe('write')
  })

  it('materias_update_schedule writes through repository.updateSchedule and summarizes only the id', async () => {
    const updated = { id: 7 } as unknown as SubjectWithSlots
    const repository = fakeRepository({ updateSchedule: vi.fn(() => updated) })
    const tools = createMateriasTools({ repository, materiasService: fakeMateriasService() })
    const tool = tools.find((candidate) => candidate.name === 'materias_update_schedule')!
    const input: UpdateSubjectScheduleInput = {
      id: 7,
      name: 'Física I',
      code: 'F1',
      color: '#000',
      docente: null,
      contacto: null,
      comision: null,
      aula: null,
      campusUrl: null,
      groupUrl: null,
      notas: null,
      attendanceMinPercent: null,
      regularity: null,
      periodId: null,
      nivel: null,
      slots: buildSlots()
    }

    const result = await tool.exec(input)

    expect(repository.updateSchedule).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('materias_update_schedule id=7')
  })

  it('materias_delete calls materiasService.deleteSubject, never repository.remove directly (PR4 boundary)', async () => {
    const deleteResult: DeleteSubjectResult = { deletedSlots: 2, deletedDeadlines: 1 }
    const repository = fakeRepository()
    const materiasService = fakeMateriasService({ deleteSubject: vi.fn(async () => deleteResult) })
    const tools = createMateriasTools({ repository, materiasService })
    const tool = tools.find((candidate) => candidate.name === 'materias_delete')!

    const result = await tool.exec({ id: 4 })

    expect(materiasService.deleteSubject).toHaveBeenCalledWith(4)
    expect(repository.remove).not.toHaveBeenCalled()
    expect(result).toBe(deleteResult)
    expect(tool.summarize({ id: 4 }, deleteResult)).toBe('materias_delete id=4')
    expect(tool.summarize({ id: 9 }, null)).toBe('materias_delete id=9: not found')
  })

  it('materias_set_outcome writes through repository.setOutcome and summarizes only the id', async () => {
    const outcomeResult = { id: 3 } as unknown as SubjectWithStatus
    const repository = fakeRepository({ setOutcome: vi.fn(() => outcomeResult) })
    const tools = createMateriasTools({ repository, materiasService: fakeMateriasService() })
    const tool = tools.find((candidate) => candidate.name === 'materias_set_outcome')!
    const input: SetSubjectOutcomeInput = { id: 3, outcome: 'aprobada', grade: null }

    const result = await tool.exec(input)

    expect(repository.setOutcome).toHaveBeenCalledWith(input)
    expect(result).toBe(outcomeResult)
    expect(tool.summarize(input, outcomeResult)).toBe('materias_set_outcome id=3')
    expect(tool.summarize({ id: 8, outcome: null, grade: null }, null)).toBe('materias_set_outcome id=8: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createMateriasTools({ repository: fakeRepository(), materiasService: fakeMateriasService() })
    const create = tools.find((candidate) => candidate.name === 'materias_create')!
    const updateSchedule = tools.find((candidate) => candidate.name === 'materias_update_schedule')!

    const createSummary = create.summarize(
      {
        name: SENTINEL,
        code: 'X',
        color: '#000',
        docente: SENTINEL,
        contacto: null,
        periodId: 1,
        nivel: null,
        slots: buildSlots()
      },
      { id: 1 } as unknown as SubjectWithSlots
    )
    const updateSummary = updateSchedule.summarize(
      {
        id: 1,
        name: SENTINEL,
        code: 'X',
        color: '#000',
        docente: null,
        contacto: null,
        comision: null,
        aula: null,
        campusUrl: null,
        groupUrl: null,
        notas: SENTINEL,
        attendanceMinPercent: null,
        regularity: null,
        periodId: null,
        nivel: null,
        slots: buildSlots()
      },
      { id: 1 } as unknown as SubjectWithSlots
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
  })

  // --- Task 5.1: Spike B ---------------------------------------------------
  //
  // Pins the SDK's JSON-schema rendering of `createSubjectInputSchema`
  // (design "defineTool and schema mapping" — the `z.preprocess` spike).
  //
  // RESULT: RESOLVED NEGATIVE against installed 1.30.0. Before the fallback,
  // `materias_create`'s advertised `tools/list` schema rendered `periodId`
  // with the correct type (`integer`) but OMITTED it from `required` —
  // confirmed by direct experiment against the raw shape: a bare
  // `z.number()` field renders required, the identical field wrapped in
  // `z.preprocess(...)` does not, even though neither is optional/nullable.
  // The design's prescribed fallback (`advertisedShapeOverrides:
  // { periodId: z.unknown() }` in `materiasTools.ts`) is applied. A directly
  // experimented control confirmed `z.unknown()` fields DO render as
  // `required` in this SDK, at the cost of losing the advertised type
  // (verified below: `properties.periodId` renders as `{}`, untyped) — this
  // IS the design's documented "JSON schema is looser" cost, not a further
  // regression. Real validation is untouched: `materiasTools.ts`'s
  // `materias_create.inputSchema` is still the exact, unmodified
  // `createSubjectInputSchema` (proven by the task 5.4 test below, and by
  // `mcpServerFactory.test.ts`'s dedicated `advertisedShapeOverrides` tests).
  describe('tools/list JSON-schema rendering (Spike B, task 5.1 — resolved negative, fallback applied)', () => {
    it('restores periodId to the advertised `required` array after the z.unknown() override, losing only its advertised type', async () => {
      const { server } = createConnectionMcpServer(
        createMateriasTools({ repository: fakeRepository(), materiasService: fakeMateriasService() }),
        { authorize: () => true, audit: vi.fn() }
      )
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'spike-b-client', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const materiasCreate = tools.find((tool) => tool.name === 'materias_create')!

      expect(materiasCreate.inputSchema.required).toEqual(
        expect.arrayContaining(['name', 'code', 'color', 'periodId', 'slots'])
      )
      // The fallback's documented cost: the advertised type is lost for the
      // overridden field specifically (design: "JSON schema is looser").
      expect(materiasCreate.inputSchema.properties?.periodId).toEqual({})
    })
  })

  // --- Task 5.4: invalid input never reaches the repository -----------------
  describe('input validation runs before any repository call (task 5.4)', () => {
    it('rejects a materias_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createMateriasTools({ repository, materiasService: fakeMateriasService() })
      const createTool = tools.find((candidate) => candidate.name === 'materias_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `name` is required by `createSubjectInputSchema` and omitted here.
      const result = await handler({
        code: 'AM1',
        color: '#fff',
        periodId: 1,
        slots: buildSlots()
      })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'materias_create' }))
    })
  })
})
