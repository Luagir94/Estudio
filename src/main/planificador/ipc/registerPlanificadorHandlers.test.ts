import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import type { PlannerEntryRecord } from '../../../shared/ipc/planificador'
import type { PlannerRepository } from '../adapters/sqlitePlannerRepository'

const { ipcMainMock } = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  return {
    ipcMainMock: {
      handlers,
      handle: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener)
      })
    }
  }
})

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))
vi.mock('electron-log', () => ({ default: { error: logErrorMock } }))

import { registerPlanificadorHandlers } from './registerPlanificadorHandlers'

function invoke(channel: string, payload?: unknown) {
  const handler = ipcMainMock.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, payload)
}

const samplePrerequisite: SubjectPrerequisite = {
  id: 1,
  subjectId: 3,
  requiredLevel: 'aprobada',
  requires: { id: 1, name: 'Álgebra I', outcome: null, regularity: null, finals: [] }
}

const sampleEntry: PlannerEntryRecord = { id: 5, periodId: 2, subjectId: 3 }

describe('registerPlanificadorHandlers', () => {
  let repository: PlannerRepository

  beforeEach(() => {
    ipcMainMock.handlers.clear()
    ipcMainMock.handle.mockClear()
    logErrorMock.mockClear()
    repository = {
      listPrerequisiteEdges: vi.fn().mockReturnValue([]),
      listPrerequisitesBySubject: vi.fn().mockReturnValue([samplePrerequisite]),
      addPrerequisite: vi.fn().mockReturnValue(samplePrerequisite),
      updatePrerequisite: vi.fn().mockReturnValue(samplePrerequisite),
      removePrerequisite: vi.fn().mockReturnValue(true),
      listEntries: vi.fn().mockReturnValue([sampleEntry]),
      addEntry: vi.fn().mockReturnValue(sampleEntry),
      removeEntry: vi.fn().mockReturnValue(true)
    }
    registerPlanificadorHandlers(repository)
  })

  // ONE read channel (the draft, which rides on nothing else) plus five
  // writes. Correlativas have no read channel of their own on purpose: they
  // travel on `materias:list` and `materias:detail`.
  it('registers exactly the six planificador:* channels', () => {
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(6)
    for (const channel of [
      'planificador:list',
      'planificador:addPrerequisite',
      'planificador:updatePrerequisite',
      'planificador:removePrerequisite',
      'planificador:addEntry',
      'planificador:removeEntry'
    ]) {
      expect(ipcMainMock.handle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  describe('planificador:list', () => {
    it('returns every draft line', () => {
      expect(invoke('planificador:list')).toEqual({ ok: true, data: [sampleEntry] })
    })

    it('reports a repository failure as an envelope, never a throw', () => {
      repository.listEntries = vi.fn(() => {
        throw new Error('disk on fire')
      })
      registerPlanificadorHandlers(repository)

      expect(invoke('planificador:list')).toEqual({
        ok: false,
        error: { code: 'LIST_FAILED', message: 'disk on fire' }
      })
    })
  })

  describe('planificador:addPrerequisite', () => {
    it('stores a well-formed edge', () => {
      const result = invoke('planificador:addPrerequisite', {
        subjectId: 3,
        requiresSubjectId: 1,
        requiredLevel: 'aprobada'
      })

      expect(result).toEqual({ ok: true, data: samplePrerequisite })
      expect(repository.addPrerequisite).toHaveBeenCalledWith({
        subjectId: 3,
        requiresSubjectId: 1,
        requiredLevel: 'aprobada'
      })
    })

    it('rejects a level outside the closed set with the stable key', () => {
      const result = invoke('planificador:addPrerequisite', {
        subjectId: 3,
        requiresSubjectId: 1,
        requiredLevel: 'cursada'
      })

      expect(result).toEqual({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'requiredLevel.invalid' } })
      expect(repository.addPrerequisite).not.toHaveBeenCalled()
    })

    it('rejects a subject requiring itself with the stable key', () => {
      const result = invoke('planificador:addPrerequisite', {
        subjectId: 3,
        requiresSubjectId: 3,
        requiredLevel: 'aprobada'
      })

      expect(result).toEqual({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'prerequisite.selfReference' } })
      expect(repository.addPrerequisite).not.toHaveBeenCalled()
    })

    // The cycle is a fact about the edges ALREADY STORED, so the handler is
    // the first place that can see it — the payload alone never can.
    it('rejects a direct cycle with the stable key', () => {
      repository.listPrerequisiteEdges = vi.fn().mockReturnValue([{ subjectId: 1, requiresSubjectId: 3 }])
      registerPlanificadorHandlers(repository)

      const result = invoke('planificador:addPrerequisite', {
        subjectId: 3,
        requiresSubjectId: 1,
        requiredLevel: 'aprobada'
      })

      expect(result).toEqual({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'prerequisite.cycle' } })
      expect(repository.addPrerequisite).not.toHaveBeenCalled()
    })

    it('rejects a transitive cycle with the stable key', () => {
      repository.listPrerequisiteEdges = vi.fn().mockReturnValue([
        { subjectId: 1, requiresSubjectId: 2 },
        { subjectId: 2, requiresSubjectId: 3 }
      ])
      registerPlanificadorHandlers(repository)

      const result = invoke('planificador:addPrerequisite', {
        subjectId: 3,
        requiresSubjectId: 1,
        requiredLevel: 'aprobada'
      })

      expect(result).toEqual({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'prerequisite.cycle' } })
    })

    // The shape the guard must NOT reject: two subjects requiring the same
    // one, joined below into a diamond. Nothing loops.
    it('accepts a diamond', () => {
      repository.listPrerequisiteEdges = vi.fn().mockReturnValue([
        { subjectId: 2, requiresSubjectId: 1 },
        { subjectId: 3, requiresSubjectId: 1 },
        { subjectId: 4, requiresSubjectId: 2 }
      ])
      registerPlanificadorHandlers(repository)

      const result = invoke('planificador:addPrerequisite', {
        subjectId: 4,
        requiresSubjectId: 3,
        requiredLevel: 'regularizada'
      })

      expect(result).toEqual({ ok: true, data: samplePrerequisite })
    })

    it('reports a repository failure as an envelope', () => {
      repository.addPrerequisite = vi.fn(() => {
        throw new Error('constraint failed')
      })
      registerPlanificadorHandlers(repository)

      expect(
        invoke('planificador:addPrerequisite', { subjectId: 3, requiresSubjectId: 1, requiredLevel: 'aprobada' })
      ).toEqual({ ok: false, error: { code: 'ADD_PREREQUISITE_FAILED', message: 'constraint failed' } })
    })
  })

  describe('planificador:updatePrerequisite', () => {
    it('changes the level', () => {
      expect(invoke('planificador:updatePrerequisite', { id: 1, requiredLevel: 'regularizada' })).toEqual({
        ok: true,
        data: samplePrerequisite
      })
    })

    // The id names a row the user believed existed — unlike the draft's
    // remove, which answers ok for a state the caller already has.
    it('reports NOT_FOUND for an id that names nothing', () => {
      repository.updatePrerequisite = vi.fn().mockReturnValue(null)
      registerPlanificadorHandlers(repository)

      expect(invoke('planificador:updatePrerequisite', { id: 404, requiredLevel: 'aprobada' })).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No prerequisite with id 404' }
      })
    })
  })

  describe('planificador:removePrerequisite', () => {
    it('removes the rule and echoes the id', () => {
      expect(invoke('planificador:removePrerequisite', { id: 1 })).toEqual({ ok: true, data: { id: 1 } })
    })

    it('reports NOT_FOUND when the rule was not there', () => {
      repository.removePrerequisite = vi.fn().mockReturnValue(false)
      registerPlanificadorHandlers(repository)

      expect(invoke('planificador:removePrerequisite', { id: 1 })).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No prerequisite with id 1' }
      })
    })
  })

  describe('planificador:addEntry', () => {
    it('puts the materia in the draft', () => {
      expect(invoke('planificador:addEntry', { periodId: 2, subjectId: 3 })).toEqual({ ok: true, data: sampleEntry })
    })

    // NOT gated on eligibility, and never will be: the planner avisa, no
    // decide. A blocked materia is still yours to draft, and the clash notice
    // says the same thing about overlapping classes.
    it('does not consult correlativas before drafting', () => {
      invoke('planificador:addEntry', { periodId: 2, subjectId: 3 })

      expect(repository.listPrerequisiteEdges).not.toHaveBeenCalled()
    })

    it('rejects a draft line with no período', () => {
      expect(invoke('planificador:addEntry', { subjectId: 3 })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' }
      })
    })
  })

  describe('planificador:removeEntry', () => {
    it('echoes the pair that was removed', () => {
      expect(invoke('planificador:removeEntry', { periodId: 2, subjectId: 3 })).toEqual({
        ok: true,
        data: { periodId: 2, subjectId: 3 }
      })
    })

    // The caller asked for the materia to be out of the draft, and it is. A
    // NOT_FOUND here would turn a double-click into an error about a state
    // the user already has — the same call `clases:clearAttendance` makes.
    it('answers ok even when the line was never in the draft', () => {
      repository.removeEntry = vi.fn().mockReturnValue(false)
      registerPlanificadorHandlers(repository)

      expect(invoke('planificador:removeEntry', { periodId: 2, subjectId: 3 })).toEqual({
        ok: true,
        data: { periodId: 2, subjectId: 3 }
      })
    })
  })
})
