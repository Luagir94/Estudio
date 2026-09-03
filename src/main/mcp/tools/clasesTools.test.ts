import { describe, expect, it, vi } from 'vitest'
import type { ClassDayInput, SetAttendanceInput } from '../../../shared/ipc/clases'
import type { AttendanceRecord } from '../../../shared/ipc/materias'
import type { ClaseRepository } from '../../clases/adapters/sqliteClaseRepository'
import { createConnectionState, createToolHandler } from '../adapters/mcpServerFactory'
import { createClasesTools } from './clasesTools'

// Sentinel marker standing in for a free-text field that must NEVER survive
// into a built audit summary — same threat pattern as `materiasTools.test.ts`
// (PR5), `carrerasTools.test.ts` (PR6) and `entregasTools.test.ts` /
// `fechasTools.test.ts` (PR7). `clases_*` has no free-text input field at all
// (`subjectId`, `date`, `status` are all identifiers/enums), so this module's
// sentinel test instead proves the summary NEVER embeds the enum `status`
// value beyond what the design's own worked example allows.
const SENTINEL = 'SENTINEL_FREE_TEXT_LEAK_MARKER_9f3c'

function fakeRepository(overrides: Partial<ClaseRepository> = {}): ClaseRepository {
  return {
    setAttendance: vi.fn(),
    clearAttendance: vi.fn(() => false),
    listAttendanceBySubject: vi.fn(() => []),
    listAttendance: vi.fn(() => []),
    listNotesBySubject: vi.fn(() => []),
    listNotes: vi.fn(() => []),
    ...overrides
  }
}

describe('createClasesTools', () => {
  it('exposes exactly two tools: clases_set_attendance and clases_clear_attendance', () => {
    const tools = createClasesTools({ repository: fakeRepository() })

    expect(tools.map((tool) => tool.name)).toEqual(['clases_set_attendance', 'clases_clear_attendance'])
  })

  it('clases_set_attendance writes through repository.setAttendance and summarizes subject + day only', async () => {
    const record: AttendanceRecord = { id: 1, subjectId: 4, date: '2026-09-02', status: 'presente' }
    const repository = fakeRepository({ setAttendance: vi.fn(() => record) })
    const tools = createClasesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'clases_set_attendance')!
    const input: SetAttendanceInput = { subjectId: 4, date: '2026-09-02', status: 'presente' }

    const result = await tool.exec(input)

    expect(repository.setAttendance).toHaveBeenCalledWith(input)
    expect(result).toBe(record)
    expect(tool.summarize(input, record)).toBe('clases_set_attendance subjectId=4 date=2026-09-02')
    expect(tool.name).toBe('clases_set_attendance')
    expect(tool.slice).toBe('clases')
    expect(tool.action).toBe('write')
  })

  it('clases_clear_attendance always answers ok, mirroring registerClasesHandlers.ts (no NOT_FOUND branch)', async () => {
    const repository = fakeRepository({ clearAttendance: vi.fn(() => false) })
    const tools = createClasesTools({ repository })
    const tool = tools.find((candidate) => candidate.name === 'clases_clear_attendance')!
    const input: ClassDayInput = { subjectId: 4, date: '2026-09-02' }

    const result = await tool.exec(input)

    expect(repository.clearAttendance).toHaveBeenCalledWith(input)
    expect(result).toEqual({ subjectId: 4, date: '2026-09-02' })
    expect(tool.summarize(input, result)).toBe('clases_clear_attendance subjectId=4 date=2026-09-02')
    expect(tool.action).toBe('write')
  })

  it('never leaks a sentinel value into any write tool summary (threat-matrix: token/PII never in summary)', async () => {
    const record: AttendanceRecord = { id: 1, subjectId: 4, date: '2026-09-02', status: 'presente' }
    const repository = fakeRepository({ setAttendance: vi.fn(() => record), clearAttendance: vi.fn(() => true) })
    const tools = createClasesTools({ repository })
    const setAttendance = tools.find((candidate) => candidate.name === 'clases_set_attendance')!
    const clearAttendance = tools.find((candidate) => candidate.name === 'clases_clear_attendance')!

    const setSummary = setAttendance.summarize(
      { subjectId: 4, date: '2026-09-02', status: 'presente' },
      { ...record, id: SENTINEL as unknown as number }
    )
    const clearSummary = clearAttendance.summarize(
      { subjectId: 4, date: '2026-09-02' },
      { subjectId: 4, date: '2026-09-02' }
    )

    expect(setSummary).not.toContain(SENTINEL)
    expect(clearSummary).not.toContain(SENTINEL)
  })

  // --- Preprocess audit (mandatory per-module check, PR5's Spike B finding):
  // `shared/ipc/clases.ts` has ZERO `z.preprocess` fields — `setAttendanceInputSchema`
  // and `classDayInputSchema` are built entirely from plain `z.number()` /
  // `z.string().regex(...)` / `z.enum(...)` chains. No SDK-round-trip audit
  // test is needed here because there is no candidate field to audit;
  // `advertisedShapeOverrides` is not used anywhere in this module. ---------

  // --- Threat-matrix parity with PR5-7: invalid input never reaches the
  // repository ----------------------------------------------------------------
  describe('input validation runs before any repository call', () => {
    it('rejects a clases_set_attendance payload missing a required field before repository.setAttendance is called', async () => {
      const repository = fakeRepository()
      const audit = vi.fn()
      const tools = createClasesTools({ repository })
      const setAttendanceTool = tools.find((candidate) => candidate.name === 'clases_set_attendance')!
      const connection = createConnectionState()
      const handler = createToolHandler(setAttendanceTool, connection, { authorize: () => true, audit })

      // `status` is required by `setAttendanceInputSchema` and omitted here.
      const result = await handler({ subjectId: 4, date: '2026-09-02' })

      expect(repository.setAttendance).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
      expect(JSON.parse((result.content[0] as { text: string }).text).code).toBe('VALIDATION_ERROR')
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid', tool: 'clases_set_attendance' }))
    })
  })
})
