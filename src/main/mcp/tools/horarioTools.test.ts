import { describe, expect, it, vi } from 'vitest'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'
import { createHorarioTools } from './horarioTools'

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

describe('createHorarioTools', () => {
  it('horario_week reads through the SAME subject repository as materias:list (design §2: no separate horario table)', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }] as unknown as SubjectWithStatus[]
    const repository = fakeRepository({ list: vi.fn(() => rows) })
    const [tool] = createHorarioTools({ repository })
    if (!tool) {
      throw new Error('expected createHorarioTools to return at least one tool')
    }

    const result = await tool.exec({})

    expect(repository.list).toHaveBeenCalledOnce()
    expect(result).toEqual({ items: rows, total: 3, count: 3, offset: 0, hasMore: false, nextOffset: null })
    expect(tool.name).toBe('horario_week')
    expect(tool.slice).toBe('horario')
    expect(tool.action).toBe('read')
    expect(tool.summarize({}, result)).toBe(`horario_week → 3 of 3 rows`)
  })
})
