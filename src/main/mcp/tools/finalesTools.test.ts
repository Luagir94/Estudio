import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type { CreateFinalExamInput, DeleteFinalExamResult, UpdateFinalExamInput } from '../../../shared/ipc/finales'
import type { FinalExamRecord } from '../../../shared/ipc/materias'
import type { FinalExamRepository } from '../../finales/adapters/sqliteFinalExamRepository'
import { createConnectionMcpServer, createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createFinalesTools } from './finalesTools'

// Sentinel marker standing in for a free-text field (label…) that must NEVER
// survive into a built audit summary — same threat pattern as every prior
// tools module (PR5-7 and this PR's `parcialesTools.test.ts`), proven here
// against the real `finales_*` `summarize` callbacks (task 8.3).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<FinalExamRepository> = {}): FinalExamRepository {
  return {
    create: vi.fn(),
    listBySubject: vi.fn(() => []),
    update: vi.fn(() => null),
    remove: vi.fn(() => false),
    ...overrides
  }
}

function buildCreateInput(): CreateFinalExamInput {
  return { subjectId: 4, label: 'Mesa de diciembre', takenOn: '2026-12-10', result: 'pendiente' }
}

describe('createFinalesTools', () => {
  it('exposes exactly three tools: finales_create, finales_update, finales_delete', () => {
    const tools = createFinalesTools({ repository: fakeRepository() })

    expect(tools.map((tool) => tool.name)).toEqual(['finales_create', 'finales_update', 'finales_delete'])
  })

  it('finales_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as FinalExamRecord
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createFinalesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'finales_create')!
    const input = buildCreateInput()

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('finales_create → id=12')
    expect(tool.slice).toBe('finales')
    expect(tool.action).toBe('write')
  })

  it('finales_update writes through repository.update and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 7 } as unknown as FinalExamRecord
    const repository = fakeRepository({ update: vi.fn(() => updated) })
    const tools = createFinalesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'finales_update')!
    const input: UpdateFinalExamInput = { id: 7, ...buildCreateInput(), result: 'aprobado', grade: 8 }

    const result = await tool.exec(input)

    expect(repository.update).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('finales_update id=7')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('finales_update id=9: not found')
  })

  it('finales_delete writes through repository.remove and reports NOT_FOUND identifiers only', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => true) })
    const tools = createFinalesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'finales_delete')!
    const expected: DeleteFinalExamResult = { id: 3 }

    const result = await tool.exec({ id: 3 })

    expect(repository.remove).toHaveBeenCalledWith(3)
    expect(result).toEqual(expected)
    expect(tool.summarize({ id: 3 }, expected)).toBe('finales_delete id=3')
    expect(tool.action).toBe('write')
  })

  it('finales_delete summarizes NOT_FOUND when repository.remove returns false', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => false) })
    const tools = createFinalesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'finales_delete')!

    const result = await tool.exec({ id: 9 })

    expect(result).toBeNull()
    expect(tool.summarize({ id: 9 }, null)).toBe('finales_delete id=9: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createFinalesTools({ repository: fakeRepository() })
    const create = tools.find((candidate) => candidate.name === 'finales_create')!
    const update = tools.find((candidate) => candidate.name === 'finales_update')!

    const createSummary = create.summarize({ subjectId: 1, label: SENTINEL, takenOn: null, result: 'pendiente' }, {
      id: 1
    } as unknown as FinalExamRecord)
    const updateSummary = update.summarize(
      { id: 1, subjectId: 1, label: SENTINEL, takenOn: null, result: 'pendiente', grade: null },
      { id: 1 } as unknown as FinalExamRecord
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
  })

  // --- Preprocess audit (mandatory per-module check, PR5's Spike B finding
  // that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
  // `tools/list` `required` array). `shared/ipc/finales.ts` has TWO
  // `z.preprocess` fields: `takenOn` (`optionalDate`) and `grade`
  // (`optionalGrade`, update-only). `grade` is `.default(null)` — genuinely
  // optional, no override needed. `takenOn` is `.nullable()` WITHOUT a
  // default — a REAL required field, the same shape class as `parciales.ts`'s
  // `takenOn` (this PR, task 8.2) and materias' `periodId` (PR5 Spike B).
  // RESOLVED NEGATIVE, empirically: run against the installed SDK before any
  // override existed, this exact test failed (`required` omitted `takenOn`).
  // Fallback applied per design/PR5 precedent:
  // `advertisedShapeOverrides: { takenOn: z.unknown() }` in
  // `finalesTools.ts`, on BOTH `finales_create` and `finales_update`. This
  // test asserts the POST-fallback state; real validation is unaffected —
  // `inputSchema` itself is untouched, proven by the "invalid input" test
  // below.
  describe('tools/list JSON-schema rendering (preprocess audit, task 8.3 — resolved negative, fallback applied)', () => {
    it('restores takenOn to the advertised required array after the z.unknown() override, losing only its advertised type', async () => {
      const { server } = createConnectionMcpServer(createFinalesTools({ repository: fakeRepository() }), {
        authorize: () => true,
        audit: vi.fn()
      })
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'finales-preprocess-audit-client', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const finalesCreate = tools.find((tool) => tool.name === 'finales_create')!

      expect(finalesCreate.inputSchema.required).toEqual(expect.arrayContaining(['subjectId', 'label', 'takenOn']))
      // `result` carries `.default('pendiente')` — genuinely optional.
      expect(finalesCreate.inputSchema.required).not.toContain('result')
      // The fallback's documented cost: the advertised type is lost for the
      // overridden field specifically (design: "JSON schema is looser").
      expect(finalesCreate.inputSchema.properties?.takenOn).toEqual({})
    })
  })

  // --- Threat-matrix parity with PR5-7 and this PR's parciales tools:
  // invalid input never reaches the repository --------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects a finales_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createFinalesTools({ repository })
      const createTool = tools.find((candidate) => candidate.name === 'finales_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `label` is required by `createFinalExamInputSchema` and omitted here.
      const result = await handler({ subjectId: 4, takenOn: '2026-12-10', result: 'pendiente' })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'finales_create' }))
    })
  })
})
