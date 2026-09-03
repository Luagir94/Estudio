import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  CreatePartialExamInput,
  DeletePartialExamResult,
  UpdatePartialExamInput
} from '../../../shared/ipc/parciales'
import type { PartialExamRecord } from '../../../shared/ipc/materias'
import type { PartialExamRepository } from '../../parciales/adapters/sqlitePartialExamRepository'
import { createConnectionMcpServer, createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createParcialesTools } from './parcialesTools'

// Sentinel marker standing in for a free-text field (label…) that must NEVER
// survive into a built audit summary — same threat pattern as
// `materiasTools.test.ts` (PR5), `carrerasTools.test.ts` (PR6) and
// `entregasTools.test.ts`/`fechasTools.test.ts` (PR7), proven here against
// the real `parciales_*` `summarize` callbacks (task 8.2).
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<PartialExamRepository> = {}): PartialExamRepository {
  return {
    create: vi.fn(),
    listBySubject: vi.fn(() => []),
    update: vi.fn(() => null),
    remove: vi.fn(() => false),
    ...overrides
  }
}

function buildCreateInput(): CreatePartialExamInput {
  return { subjectId: 4, label: '1er parcial', takenOn: '2026-05-10', result: 'pendiente', grade: null }
}

describe('createParcialesTools', () => {
  it('exposes exactly three tools: parciales_create, parciales_update, parciales_delete', () => {
    const tools = createParcialesTools({ repository: fakeRepository() })

    expect(tools.map((tool) => tool.name)).toEqual(['parciales_create', 'parciales_update', 'parciales_delete'])
  })

  it('parciales_create writes through repository.create and summarizes only the created id', async () => {
    const created = { id: 12 } as unknown as PartialExamRecord
    const repository = fakeRepository({ create: vi.fn(() => created) })
    const tools = createParcialesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'parciales_create')!
    const input = buildCreateInput()

    const result = await tool.exec(input)

    expect(repository.create).toHaveBeenCalledWith(input)
    expect(result).toBe(created)
    expect(tool.summarize(input, created)).toBe('parciales_create → id=12')
    expect(tool.slice).toBe('parciales')
    expect(tool.action).toBe('write')
  })

  it('parciales_update writes through repository.update and reports NOT_FOUND identifiers only', async () => {
    const updated = { id: 7 } as unknown as PartialExamRecord
    const repository = fakeRepository({ update: vi.fn(() => updated) })
    const tools = createParcialesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'parciales_update')!
    const input: UpdatePartialExamInput = { id: 7, ...buildCreateInput(), result: 'aprobado', grade: 8 }

    const result = await tool.exec(input)

    expect(repository.update).toHaveBeenCalledWith(input)
    expect(result).toBe(updated)
    expect(tool.summarize(input, updated)).toBe('parciales_update id=7')
    expect(tool.summarize({ ...input, id: 9 }, null)).toBe('parciales_update id=9: not found')
  })

  it('parciales_delete writes through repository.remove and reports NOT_FOUND identifiers only', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => true) })
    const tools = createParcialesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'parciales_delete')!
    const expected: DeletePartialExamResult = { id: 3 }

    const result = await tool.exec({ id: 3 })

    expect(repository.remove).toHaveBeenCalledWith(3)
    expect(result).toEqual(expected)
    expect(tool.summarize({ id: 3 }, expected)).toBe('parciales_delete id=3')
    expect(tool.action).toBe('write')
  })

  it('parciales_delete summarizes NOT_FOUND when repository.remove returns false', async () => {
    const repository = fakeRepository({ remove: vi.fn(() => false) })
    const tools = createParcialesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'parciales_delete')!

    const result = await tool.exec({ id: 9 })

    expect(result).toBeNull()
    expect(tool.summarize({ id: 9 }, null)).toBe('parciales_delete id=9: not found')
  })

  it('never leaks a sentinel free-text field into any write tool summary (threat-matrix: token/PII never in summary)', () => {
    const tools = createParcialesTools({ repository: fakeRepository() })
    const create = tools.find((candidate) => candidate.name === 'parciales_create')!
    const update = tools.find((candidate) => candidate.name === 'parciales_update')!

    const createSummary = create.summarize(
      { subjectId: 1, label: SENTINEL, takenOn: null, result: 'pendiente', grade: null },
      { id: 1 } as unknown as PartialExamRecord
    )
    const updateSummary = update.summarize(
      { id: 1, subjectId: 1, label: SENTINEL, takenOn: null, result: 'pendiente', grade: null },
      { id: 1 } as unknown as PartialExamRecord
    )

    expect(createSummary).not.toContain(SENTINEL)
    expect(updateSummary).not.toContain(SENTINEL)
  })

  // --- Preprocess audit (mandatory per-module check, PR5's Spike B finding
  // that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
  // `tools/list` `required` array). `shared/ipc/parciales.ts` has TWO
  // `z.preprocess` fields: `takenOn` (`optionalDate`) and `grade`
  // (`optionalGrade`). `grade` is `.default(null)` — genuinely optional, no
  // override needed, same as carreras' `institution` (PR6) and fechas'
  // `endsOn` (PR7).
  //
  // `takenOn` is `.nullable()` WITHOUT a default — a REAL required field, the
  // same shape class as materias' `periodId` (PR5 Spike B). RESOLVED
  // NEGATIVE, empirically: run against the installed SDK before any override
  // existed, this exact test failed (`required` omitted `takenOn`) —
  // confirming the SAME bug PR5 found. Fallback applied per design/PR5
  // precedent: `advertisedShapeOverrides: { takenOn: z.unknown() }` in
  // `parcialesTools.ts`, on BOTH `parciales_create` and `parciales_update`.
  // This test now asserts the POST-fallback state; the fallback's documented
  // cost (losing the advertised type for `takenOn` specifically) is the same
  // trade design accepted for materias' `periodId`. Real validation is
  // unaffected — `inputSchema` itself is untouched, proven by the "invalid
  // input" test below.
  describe('tools/list JSON-schema rendering (preprocess audit, task 8.2 — resolved negative, fallback applied)', () => {
    it('restores takenOn to the advertised required array after the z.unknown() override, losing only its advertised type', async () => {
      const { server } = createConnectionMcpServer(createParcialesTools({ repository: fakeRepository() }), {
        authorize: () => true,
        audit: vi.fn()
      })
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
      const client = new Client({ name: 'parciales-preprocess-audit-client', version: '0.0.0' })

      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const { tools } = await client.listTools()
      const parcialesCreate = tools.find((tool) => tool.name === 'parciales_create')!

      expect(parcialesCreate.inputSchema.required).toEqual(expect.arrayContaining(['subjectId', 'label', 'takenOn']))
      // `result` and `grade` both carry `.default(...)` — genuinely optional,
      // regardless of the SDK's preprocess-required quirk.
      expect(parcialesCreate.inputSchema.required).not.toContain('grade')
      // The fallback's documented cost: the advertised type is lost for the
      // overridden field specifically (design: "JSON schema is looser").
      expect(parcialesCreate.inputSchema.properties?.takenOn).toEqual({})
    })
  })

  // --- Threat-matrix parity with PR5-7: invalid input never reaches the
  // repository ----------------------------------------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects a parciales_create payload missing a required field before repository.create is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createParcialesTools({ repository })
      const createTool = tools.find((candidate) => candidate.name === 'parciales_create')!
      const connection = createConnectionState()
      const handler = createToolHandler(createTool, connection, { authorize: () => true, audit })

      // `label` is required by `createPartialExamInputSchema` and omitted here.
      const result = await handler({ subjectId: 4, takenOn: '2026-05-10', result: 'pendiente' })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'parciales_create' }))
    })
  })
})
