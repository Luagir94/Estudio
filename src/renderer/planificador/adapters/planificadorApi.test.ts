// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import type { PlannerEntryRecord } from '../../../shared/ipc/planificador'
import { PlanificadorApiError, planificadorApi } from './planificadorApi'

const samplePrerequisite: SubjectPrerequisite = {
  id: 1,
  subjectId: 3,
  requiredLevel: 'aprobada',
  requires: { id: 1, name: 'Álgebra I', outcome: 'aprobada', regularity: null, finals: [] }
}

const sampleEntry: PlannerEntryRecord = { id: 5, periodId: 2, subjectId: 3 }

describe('planificadorApi', () => {
  beforeEach(() => {
    // @ts-expect-error test-only global stub
    window.api = {
      planificador: {
        list: vi.fn(),
        addPrerequisite: vi.fn(),
        updatePrerequisite: vi.fn(),
        removePrerequisite: vi.fn(),
        addEntry: vi.fn(),
        removeEntry: vi.fn()
      }
    }
  })

  it('list parses and returns every draft line', async () => {
    vi.mocked(window.api.planificador.list).mockResolvedValue({ ok: true, data: [sampleEntry] })

    expect(await planificadorApi.list()).toEqual([sampleEntry])
  })

  it('addPrerequisite parses and returns the stored rule', async () => {
    vi.mocked(window.api.planificador.addPrerequisite).mockResolvedValue({ ok: true, data: samplePrerequisite })

    expect(
      await planificadorApi.addPrerequisite({ subjectId: 3, requiresSubjectId: 1, requiredLevel: 'aprobada' })
    ).toEqual(samplePrerequisite)
  })

  // The renderer maps its Spanish copy off the CODE, never `message`
  // (`shared/lib/ipcErrorCopy.ts`) — so the throw has to carry it.
  it('addPrerequisite throws an error carrying the envelope code', async () => {
    vi.mocked(window.api.planificador.addPrerequisite).mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'prerequisite.cycle' }
    })

    const error: unknown = await planificadorApi
      .addPrerequisite({ subjectId: 3, requiresSubjectId: 1, requiredLevel: 'aprobada' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(PlanificadorApiError)
    expect((error as PlanificadorApiError).code).toBe('VALIDATION_ERROR')
    // The machine key survives the throw so a caller can tell a cycle from any
    // other refusal, even though the BANNER is mapped from the code.
    expect((error as PlanificadorApiError).message).toBe('prerequisite.cycle')
  })

  it('updatePrerequisite parses and returns the corrected rule', async () => {
    vi.mocked(window.api.planificador.updatePrerequisite).mockResolvedValue({ ok: true, data: samplePrerequisite })

    expect(await planificadorApi.updatePrerequisite({ id: 1, requiredLevel: 'aprobada' })).toEqual(samplePrerequisite)
  })

  it('removePrerequisite echoes the id that was removed', async () => {
    vi.mocked(window.api.planificador.removePrerequisite).mockResolvedValue({ ok: true, data: { id: 1 } })

    expect(await planificadorApi.removePrerequisite(1)).toEqual({ id: 1 })
  })

  it('addEntry parses and returns the stored draft line', async () => {
    vi.mocked(window.api.planificador.addEntry).mockResolvedValue({ ok: true, data: sampleEntry })

    expect(await planificadorApi.addEntry({ periodId: 2, subjectId: 3 })).toEqual(sampleEntry)
  })

  it('removeEntry echoes the pair that was removed', async () => {
    vi.mocked(window.api.planificador.removeEntry).mockResolvedValue({
      ok: true,
      data: { periodId: 2, subjectId: 3 }
    })

    expect(await planificadorApi.removeEntry({ periodId: 2, subjectId: 3 })).toEqual({ periodId: 2, subjectId: 3 })
  })

  // A malformed SUCCESS payload is an app bug, not a reportable IPC outcome —
  // it must fail as the schema's own error, never dressed up as an ApiError.
  it('rejects a success payload that does not match the schema', async () => {
    vi.mocked(window.api.planificador.list).mockResolvedValue({ ok: true, data: [{ id: 'five' }] } as never)

    const error: unknown = await planificadorApi.list().catch((caught: unknown) => caught)

    expect(error).not.toBeInstanceOf(PlanificadorApiError)
  })
})
