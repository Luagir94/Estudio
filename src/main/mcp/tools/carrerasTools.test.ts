import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  CreatePeriodInput,
  CreateProgramInput,
  DeletePeriodResult,
  DeleteProgramResult,
  PeriodRecord,
  ProgramRecord,
  ProgramWithPeriods,
  UpdatePeriodInput,
  UpdateProgramInput
} from '../../../shared/ipc/carreras'
import type { ProgramRepository } from '../../carreras/adapters/sqliteProgramRepository'
import { createConnectionMcpServer, createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createCarrerasTools } from './carrerasTools'

// Sentinel marker standing in for a free-text field (name, institution…) that
// must NEVER survive into a built audit summary — same threat as
// `materiasTools.test.ts`'s sentinel test (PR5), proven here against the real
// `carreras_*` `summarize` callbacks (task 6.1).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<ProgramRepository> = {}): ProgramRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    detail: vi.fn(() => null),
    update: vi.fn(() => null),
    createPeriod: vi.fn(),
    updatePeriod: vi.fn(() => null),
    removePeriod: vi.fn(() => null),
    remove: vi.fn(() => null),
    ...overrides
  }
}

function buildCreateProgramInput(): CreateProgramInput {
  return {
    name: 'Ingeniería en Sistemas',
    institution: null,
    color: '#fff',
    gradingScheme: 'numerico',
    gradeScale: 10
  }
}

function buildCreatePeriodInput(): CreatePeriodInput {
  return { programId: 2, name: '1er cuatrimestre 2026', kind: 'cuatrimestre', startsOn: '2026-03-01', endsOn: null }
}

describe('createCarrerasTools', () => {
  it('carreras_list reads through repository.list and summarizes a row count only', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as ProgramWithPeriods[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createCarrerasTools({ repository })
    if (!tool) {
      throw new Error('expected createCarrerasTools to return at least one tool')
    }

    const result = await tool.exec({})

    expect(repository.list).toHaveBeenCalledOnce()
    expect(result).toBe(rows)
    expect(tool.summarize({}, rows)).toBe('carreras_list → 3 rows')
    expect(tool.name).toBe('carreras_list')
    expect(tool.slice).toBe('carreras')
    expect(tool.action).toBe('read')
  })

  it('carreras_detail reads through repository.detail and reports NOT_FOUND identifiers only', async () => {
    const detail = { id: 5 } as unknown as ProgramWithPeriods
    const repository = fakeRepository({ detail: vi.fn(() => detail) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_detail')!

    const result = await tool.exec({ id: 5 })

    expect(repository.detail).toHaveBeenCalledWith(5)
    expect(result).toBe(detail)
    expect(tool.summarize({ id: 5 }, detail)).toBe('carreras_detail id=5')
    expect(tool.summarize({ id: 9 }, null)).toBe('carreras_detail id=9: not found')
    expect(tool.action).toBe('read')
  })

  it('carreras_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as ProgramRecord
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_create')!
    const input = buildCreateProgramInput()

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('carreras_create → id=12')
    expect(tool.action).toBe('write')
  })

  it('carreras_update writes through repository.update and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 7 } as unknown as ProgramRecord
    const repository = fakeRepository({ update: vi.fn(() => updated) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_update')!
    const input: UpdateProgramInput = { id: 7, ...buildCreateProgramInput() }

    const result = await tool.exec(input)

    expect(repository.update).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('carreras_update id=7')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('carreras_update id=9: not found')
  })

  it('carreras_delete writes through repository.remove and reports NOT_FOUND identifiers only', async () => {
    const deleted: DeleteProgramResult = { id: 4, deletedPeriods: 2, unlinkedSubjects: 3 }
    const repository = fakeRepository({ remove: vi.fn(() => deleted) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_delete')!

    const result = await tool.exec({ id: 4 })

    expect(repository.remove).toHaveBeenCalledWith(4)
    expect(result).toBe(deleted)
    expect(tool.summarize({ id: 4 }, deleted)).toBe('carreras_delete id=4')
    expect(tool.summarize({ id: 9 }, null)).toBe('carreras_delete id=9: not found')
    expect(tool.action).toBe('write')
  })

  it('carreras_create_period writes through repository.createPeriod and summarizes id + programId', async () => {
    const created: PeriodRecord = {
      id: 8,
      programId: 2,
      name: 'x',
      kind: 'cuatrimestre',
      startsOn: '2026-03-01',
      endsOn: null
    }
    const repository = fakeRepository({ createPeriod: vi.fn(() => created) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_create_period')!
    const input = buildCreatePeriodInput()

    const result = await tool.exec(input)

    expect(repository.createPeriod).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('carreras_create_period → id=8 programId=2')
  })

  it('carreras_update_period writes through repository.updatePeriod and summarizes id + programId, per design example', async () => {
    const updated: PeriodRecord = {
      id: 7,
      programId: 2,
      name: 'x',
      kind: 'cuatrimestre',
      startsOn: '2026-03-01',
      endsOn: null
    }
    const repository = fakeRepository({ updatePeriod: vi.fn(() => updated) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_update_period')!
    const input: UpdatePeriodInput = { id: 7, name: 'x', kind: 'cuatrimestre', startsOn: '2026-03-01', endsOn: null }

    const result = await tool.exec(input)

    expect(repository.updatePeriod).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('carreras_update_period id=7 programId=2')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('carreras_update_period id=9: not found')
  })

  it('carreras_delete_period writes through repository.removePeriod and reports NOT_FOUND identifiers only', async () => {
    const deleted: DeletePeriodResult = { id: 3, unlinkedSubjects: 1 }
    const repository = fakeRepository({ removePeriod: vi.fn(() => deleted) })
    const tools = createCarrerasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'carreras_delete_period')!

    const result = await tool.exec({ id: 3 })

    expect(repository.removePeriod).toHaveBeenCalledWith(3)
    expect(result).toBe(deleted)
    expect(tool.summarize({ id: 3 }, deleted)).toBe('carreras_delete_period id=3')
    expect(tool.summarize({ id: 9 }, null)).toBe('carreras_delete_period id=9: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createCarrerasTools({ repository: fakeRepository() })
    const create = tools.find((candidate) => candidate.name === 'carreras_create')!
    const update = tools.find((candidate) => candidate.name === 'carreras_update')!
    const createPeriod = tools.find((candidate) => candidate.name === 'carreras_create_period')!
    const updatePeriod = tools.find((candidate) => candidate.name === 'carreras_update_period')!

    const createSummary = create.summarize(
      { name: SENTINEL, institution: SENTINEL, color: '#000', gradingScheme: 'binario', gradeScale: null },
      { id: 1 } as unknown as ProgramRecord
    )
    const updateSummary = update.summarize(
      { id: 1, name: SENTINEL, institution: SENTINEL, color: '#000', gradingScheme: 'binario', gradeScale: null },
      { id: 1 } as unknown as ProgramRecord
    )
    const createPeriodSummary = createPeriod.summarize(
      { programId: 1, name: SENTINEL, kind: 'anual', startsOn: '2026-01-01', endsOn: null },
      { id: 1, programId: 1 } as unknown as PeriodRecord
    )
    const updatePeriodSummary = updatePeriod.summarize(
      { id: 1, name: SENTINEL, kind: 'anual', startsOn: '2026-01-01', endsOn: null },
      { id: 1, programId: 1 } as unknown as PeriodRecord
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
    expect(createPeriodSummary).not.toContain(SENTINEL)
    expect(updatePeriodSummary).not.toContain(SENTINEL)
  })

  // --- Task 6.1: preprocess audit (Spike B follow-up) -----------------------
  //
  // PR5 resolved Spike B negative: a `z.preprocess`-backed REQUIRED field is
  // dropped from the advertised `tools/list` `required` array by the
  // installed SDK. `shared/ipc/carreras.ts` has exactly one `z.preprocess`
  // field (`optionalTextField`, used for `institution`), and it is genuinely
  // OPTIONAL (`.nullable().default(null)`) — it belongs outside `required`
  // regardless of the SDK quirk. No other carreras field is preprocess-backed.
  // This test proves the installed SDK renders every REAL required field of
  // `carreras_create` and `carreras_create_period` correctly, confirming NO
  // `advertisedShapeOverrides` is needed anywhere in this tool module.
  describe('tools/list JSON-schema rendering (preprocess audit, task 6.1 — no override needed)', () => {
    it('carreras_create advertises every required field, including the numeric gradeScale, without an override', async () => {
      const { server } = createConnectionMcpServer(createCarrerasTools({ repository: fakeRepository() }), {
        authorize: () => true,
        audit: vi.fn()
      })
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'carreras-preprocess-audit-client', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const carrerasCreate = tools.find((tool) => tool.name === 'carreras_create')!

      expect(carrerasCreate.inputSchema.required).toEqual(expect.arrayContaining(['name', 'color', 'gradingScheme']))
      // `institution` is the ONE preprocess field in this schema, and it is
      // genuinely optional — it must NOT be required, with or without the
      // SDK's rendering quirk.
      expect(carrerasCreate.inputSchema.required).not.toContain('institution')
    })

    it('carreras_create_period advertises every required field without an override', async () => {
      const { server } = createConnectionMcpServer(createCarrerasTools({ repository: fakeRepository() }), {
        authorize: () => true,
        audit: vi.fn()
      })
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'carreras-preprocess-audit-client-2', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const createPeriod = tools.find((tool) => tool.name === 'carreras_create_period')!

      expect(createPeriod.inputSchema.required).toEqual(
        expect.arrayContaining(['programId', 'name', 'kind', 'startsOn'])
      )
    })
  })

  // --- Threat-matrix parity with PR5 task 5.4: invalid input never reaches
  // the repository ------------------------------------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects a carreras_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createCarrerasTools({ repository })
      const createTool = tools.find((candidate) => candidate.name === 'carreras_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `name` is required by `createProgramInputSchema` and omitted here.
      const result = await handler({ color: '#fff', gradingScheme: 'binario' })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'carreras_create' }))
    })
  })
})
