// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectPrerequisite, SubjectWithStatus } from '../../../shared/ipc/materias'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { planificadorApi } from '../adapters/planificadorApi'
import { CorrelativasFieldContainer } from './CorrelativasFieldContainer'

vi.mock('../adapters/planificadorApi', () => ({
  planificadorApi: { addPrerequisite: vi.fn(), updatePrerequisite: vi.fn(), removePrerequisite: vi.fn() }
}))

vi.mock('../../materias/adapters/materiasApi', () => ({
  materiasApi: { list: vi.fn() }
}))

function subject(overrides: Partial<SubjectWithStatus> & { id: number; name: string }): SubjectWithStatus {
  return {
    code: `COD-${overrides.id}`,
    color: '#4c8dff',
    docente: null,
    contacto: null,
    comision: null,
    aula: null,
    campusUrl: null,
    groupUrl: null,
    notas: null,
    attendanceMinPercent: null,
    periodId: null,
    outcome: null,
    grade: null,
    regularity: null,
    slots: [],
    period: null,
    program: null,
    finals: [],
    pendingDeadlines: 0,
    prerequisites: [],
    ...overrides
  }
}

function prerequisite(overrides: Partial<SubjectPrerequisite> & { id: number }): SubjectPrerequisite {
  return {
    subjectId: 3,
    requiredLevel: 'aprobada',
    ...overrides,
    requires: { id: 1, name: 'Álgebra I', outcome: null, regularity: null, finals: [], ...overrides.requires }
  }
}

function renderContainer(prerequisites: SubjectPrerequisite[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CorrelativasFieldContainer subjectId={3} prerequisites={prerequisites} />
    </QueryClientProvider>
  )
  return queryClient
}

describe('CorrelativasFieldContainer', () => {
  beforeEach(() => {
    vi.mocked(materiasApi.list).mockResolvedValue([])
    vi.mocked(planificadorApi.addPrerequisite).mockResolvedValue(prerequisite({ id: 7 }))
    vi.mocked(planificadorApi.updatePrerequisite).mockResolvedValue(prerequisite({ id: 7 }))
    vi.mocked(planificadorApi.removePrerequisite).mockResolvedValue({ id: 7 })
  })

  // A materia cannot be its own correlativa, and the picker must not be the
  // place that discovers it.
  it('never offers the materia itself', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 3, name: 'Estructuras de Datos' }),
      subject({ id: 1, name: 'Álgebra I' })
    ])
    renderContainer()

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar correlativa' }))
    const picker = screen.getByRole('combobox', { name: 'Materia correlativa' })

    expect(within(picker).queryByText('Estructuras de Datos')).not.toBeInTheDocument()
    expect(within(picker).getByText('Álgebra I')).toBeInTheDocument()
  })

  // The affordance must never offer an edge the write path would refuse.
  it('never offers a materia that already requires this one', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 3, name: 'Estructuras de Datos' }),
      subject({
        id: 4,
        name: 'Sistemas Operativos',
        prerequisites: [{ requiresSubjectId: 3, requiredLevel: 'aprobada' }]
      }),
      subject({ id: 1, name: 'Álgebra I' })
    ])
    renderContainer()

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar correlativa' }))
    const picker = screen.getByRole('combobox', { name: 'Materia correlativa' })

    expect(within(picker).queryByText('Sistemas Operativos')).not.toBeInTheDocument()
    expect(within(picker).getByText('Álgebra I')).toBeInTheDocument()
  })

  it('never offers a materia that requires this one transitively', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 3, name: 'Estructuras de Datos' }),
      subject({
        id: 4,
        name: 'Sistemas Operativos',
        prerequisites: [{ requiresSubjectId: 3, requiredLevel: 'aprobada' }]
      }),
      subject({ id: 5, name: 'Redes', prerequisites: [{ requiresSubjectId: 4, requiredLevel: 'aprobada' }] })
    ])
    renderContainer()

    // No button to open: with nothing left to require, the action is
    // replaced by the explanation.
    expect(await screen.findByText(/No queda ninguna materia/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar correlativa' })).not.toBeInTheDocument()
  })

  // A diamond is not a cycle: two materias may require the same one, and one
  // materia may require two that share a prerequisite.
  it('still offers a materia that only shares a prerequisite', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 1, name: 'Álgebra I' }),
      subject({ id: 2, name: 'Análisis I', prerequisites: [{ requiresSubjectId: 1, requiredLevel: 'aprobada' }] }),
      subject({ id: 3, name: 'Estructuras', prerequisites: [{ requiresSubjectId: 1, requiredLevel: 'aprobada' }] })
    ])
    renderContainer()

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar correlativa' }))
    const picker = screen.getByRole('combobox', { name: 'Materia correlativa' })

    expect(within(picker).getByText('Análisis I')).toBeInTheDocument()
  })

  it('never offers a materia that is already a correlativa of this one', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 3, name: 'Estructuras de Datos' }),
      subject({ id: 1, name: 'Álgebra I' })
    ])
    renderContainer([prerequisite({ id: 7 })])

    expect(await screen.findByText(/No queda ninguna materia/)).toBeInTheDocument()
  })

  it('records a new correlativa against this materia', async () => {
    vi.mocked(materiasApi.list).mockResolvedValue([
      subject({ id: 3, name: 'Estructuras de Datos' }),
      subject({ id: 1, name: 'Álgebra I' })
    ])
    renderContainer()

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar correlativa' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Materia correlativa' }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(planificadorApi.addPrerequisite).toHaveBeenCalledTimes(1))
    expect(vi.mocked(planificadorApi.addPrerequisite).mock.calls[0]?.[0]).toEqual({
      subjectId: 3,
      requiresSubjectId: 1,
      requiredLevel: 'aprobada'
    })
  })

  it('corrects the level of an existing correlativa', async () => {
    renderContainer([prerequisite({ id: 7 })])

    fireEvent.change(await screen.findByRole('combobox', { name: 'Nivel de Álgebra I' }), {
      target: { value: 'regularizada' }
    })

    await waitFor(() => expect(planificadorApi.updatePrerequisite).toHaveBeenCalledTimes(1))
    expect(vi.mocked(planificadorApi.updatePrerequisite).mock.calls[0]?.[0]).toEqual({
      id: 7,
      requiredLevel: 'regularizada'
    })
  })

  it('removes a correlativa', async () => {
    renderContainer([prerequisite({ id: 7 })])

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Álgebra I de las correlativas' }))

    await waitFor(() => expect(planificadorApi.removePrerequisite).toHaveBeenCalledTimes(1))
    expect(vi.mocked(planificadorApi.removePrerequisite).mock.calls[0]?.[0]).toBe(7)
  })

  // Every write here changes a fact the subject payloads carry, so the whole
  // ['materias'] tree is invalidated — the CORRELATIVAS card on the screen
  // behind the modal and the Planificador's verdicts both follow.
  it('invalidates the subject caches after a write', async () => {
    const queryClient = renderContainer([prerequisite({ id: 7 })])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Álgebra I de las correlativas' }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['materias'] }))
  })
})
