import { describe, expect, it, vi } from 'vitest'
import type {
  CreateDeadlineInput,
  DeadlineWithSubject,
  DeleteDeadlineResult,
  UpdateDeadlineInput
} from '../../../shared/ipc/entregas'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import { createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createEntregasTools } from './entregasTools'

// Sentinel marker standing in for a free-text field (title…) that must NEVER
// survive into a built audit summary — same threat pattern as
// `materiasTools.test.ts` (PR5) and `carrerasTools.test.ts` (PR6), proven
// here against the real `entregas_*` `summarize` callbacks (task 7.1).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<DeadlineRepository> = {}): DeadlineRepository {
  return {
    create: vi.fn(),
    list: vi.fn(() => []),
    update: vi.fn(() => null),
    setDone: vi.fn(() => null),
    remove: vi.fn(() => false),
    ...overrides
  }
}

function buildCreateInput(): CreateDeadlineInput {
  return { title: 'TP integrador', subjectId: 3, type: 'trabajo práctico', dueAt: '2026-09-10T23:59' }
}

describe('createEntregasTools', () => {
  it('entregas_list reads through repository.list and summarizes a row count only', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as DeadlineWithSubject[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createEntregasTools({ repository })
    if (!tool) {
      throw new Error('expected createEntregasTools to return at least one tool')
    }

    const result = await tool.exec({})

    expect(repository.list).toHaveBeenCalledOnce()
    expect(result).toEqual({ items: rows, total: 3, count: 3, offset: 0, hasMore: false, nextOffset: null })
    expect(tool.summarize({}, result)).toBe(`entregas_list → 3 of 3 rows`)
    expect(tool.name).toBe('entregas_list')
    expect(tool.slice).toBe('entregas')
    expect(tool.action).toBe('read')
  })

  it('entregas_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as DeadlineWithSubject
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createEntregasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'entregas_create')!
    const input = buildCreateInput()

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('entregas_create → id=12')
    expect(tool.action).toBe('write')
  })

  it('entregas_update writes through repository.update and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 7 } as unknown as DeadlineWithSubject
    const repository = fakeRepository({ update: vi.fn(() => updated) })
    const tools = createEntregasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'entregas_update')!
    const input: UpdateDeadlineInput = { id: 7, ...buildCreateInput() }

    const result = await tool.exec(input)

    expect(repository.update).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('entregas_update id=7')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('entregas_update id=9: not found')
  })

  it('entregas_set_done writes through repository.setDone and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 4 } as unknown as DeadlineWithSubject
    const repository = fakeRepository({ setDone: vi.fn(() => updated) })
    const tools = createEntregasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'entregas_set_done')!

    const result = await tool.exec({ id: 4, done: true })

    expect(repository.setDone).toHaveBeenCalledWith(4, true)
    expect(result).toBe(updated)
    expect(tool.summarize({ id: 4, done: true }, updated)).toBe('entregas_set_done id=4')
    expect(tool.summarize({ id: 9, done: false }, null)).toBe('entregas_set_done id=9: not found')
  })

  it('entregas_delete writes through repository.remove and reports NOT_FOUND identifiers only', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => true) })
    const tools = createEntregasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'entregas_delete')!
    const expected: DeleteDeadlineResult = { id: 3 }

    const result = await tool.exec({ id: 3 })

    expect(repository.remove).toHaveBeenCalledWith(3)
    expect(result).toEqual(expected)
    expect(tool.summarize({ id: 3 }, expected)).toBe('entregas_delete id=3')
    expect(tool.action).toBe('write')
  })

  it('entregas_delete summarizes NOT_FOUND when repository.remove returns false', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => false) })
    const tools = createEntregasTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'entregas_delete')!

    const result = await tool.exec({ id: 9 })

    expect(result).toBeNull()
    expect(tool.summarize({ id: 9 }, null)).toBe('entregas_delete id=9: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createEntregasTools({ repository: fakeRepository() })
    const create = tools.find((candidate) => candidate.name === 'entregas_create')!
    const update = tools.find((candidate) => candidate.name === 'entregas_update')!

    const createSummary = create.summarize(
      { title: SENTINEL, subjectId: 1, type: SENTINEL, dueAt: '2026-09-10T23:59' },
      { id: 1 } as unknown as DeadlineWithSubject
    )
    const updateSummary = update.summarize(
      { id: 1, title: SENTINEL, subjectId: 1, type: SENTINEL, dueAt: '2026-09-10T23:59' },
      { id: 1 } as unknown as DeadlineWithSubject
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
  })

  // --- Preprocess audit (task 7.1's mandatory check, per PR5's Spike B
  // finding that a `z.preprocess`-backed REQUIRED field is dropped from the
  // advertised `tools/list` `required` array): `shared/ipc/entregas.ts` has
  // ZERO `z.preprocess` fields — `createDeadlineInputSchema` and
  // `updateDeadlineInputSchema` are built entirely from plain `z.string()` /
  // `z.number()` chains. No SDK-round-trip audit test is needed here because
  // there is no candidate field to audit; `advertisedShapeOverrides` is not
  // used anywhere in this module. -----------------------------------------

  // --- Threat-matrix parity with PR5 task 5.4 / PR6 task 6.1: invalid input
  // never reaches the repository -------------------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects an entregas_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createEntregasTools({ repository })
      const createTool = tools.find((candidate) => candidate.name === 'entregas_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `title` is required by `createDeadlineInputSchema` and omitted here.
      const result = await handler({ subjectId: 1, type: 'trabajo práctico', dueAt: '2026-09-10T23:59' })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'entregas_create' }))
    })
  })
})
