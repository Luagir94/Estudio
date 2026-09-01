// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SubjectWithStatus } from '../../../shared/ipc/materias'
import { MateriasList } from './MateriasList'

const today = new Date(2026, 7, 15)

const activePeriod = { id: 2, name: '2do Cuatrimestre 2026', startsOn: '2026-08-12', endsOn: '2026-12-04' }
const finishedPeriod = { id: 1, name: '1er Cuatrimestre 2026', startsOn: '2026-03-09', endsOn: '2026-07-18' }

const base: SubjectWithStatus = {
  id: 1,
  name: 'Derecho Constitucional',
  code: 'DC-201',
  color: '#4c8dff',
  docente: null,
  contacto: null,
  comision: null,
  aula: null,
  campusUrl: null,
  groupUrl: null,
  notas: null,
  attendanceMinPercent: 75,
  periodId: 2,
  programId: null,
  nivel: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 480, endMinutes: 570, location: 'Aula 204' }],
  period: activePeriod,
  program: { id: 1, name: 'Abogacía', gradingScheme: 'numerico', gradeScale: 10 },
  finals: [],
  pendingDeadlines: 0,
  prerequisites: []
}

function renderList(subjects: SubjectWithStatus[], onSelect?: (id: number) => void) {
  return render(<MateriasList subjects={subjects} now={today} onSelect={onSelect} />)
}

describe('MateriasList — without navigation', () => {
  // A row that looks clickable and does nothing is a lie. When the caller
  // has nowhere to send the user (the carrera detail), the row is plain
  // markup, not a dead button.
  it('renders plain rows when no onSelect is given', () => {
    renderList([base])

    expect(screen.getByText('Derecho Constitucional')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets the caller word its own empty state', () => {
    render(<MateriasList subjects={[]} now={today} emptyMessage="Esta carrera todavía no tiene materias." />)

    expect(screen.getByText('Esta carrera todavía no tiene materias.')).toBeInTheDocument()
    expect(screen.queryByText(/coincidan con este filtro/)).not.toBeInTheDocument()
  })
})

describe('MateriasList', () => {
  it('says so when the filter matched nothing', () => {
    renderList([])

    expect(
      screen.getByText('No hay materias que coincidan con este filtro. Elegí otro filtro para ver más.')
    ).toBeInTheDocument()
  })

  it('shows the subject with its schedule and attendance rule', () => {
    renderList([base])

    expect(screen.getByText('Derecho Constitucional')).toBeInTheDocument()
    expect(screen.getByText('Lun · 08:00')).toBeInTheDocument()
    expect(screen.getByText('75% requerido')).toBeInTheDocument()
  })

  it('tags each subject with the period it belongs to', () => {
    renderList([base])

    expect(screen.getByText('2do Cuatrimestre 2026')).toBeInTheDocument()
  })

  it('flags a subject that belongs to no period', () => {
    renderList([{ ...base, periodId: null, period: null, program: null }])

    expect(screen.getByText('Sin período')).toBeInTheDocument()
  })

  it('reads a subject in a running period as cursando', () => {
    renderList([base])

    expect(screen.getByText('Cursando')).toBeInTheDocument()
  })

  it('reads a subject whose period ended with no decision as sin cerrar', () => {
    renderList([{ ...base, periodId: 1, period: finishedPeriod }])

    expect(screen.getByText('Sin cerrar')).toBeInTheDocument()
  })

  it('never asks to close a subject that has no period', () => {
    renderList([{ ...base, periodId: null, period: null, program: null }])

    expect(screen.queryByText('Sin cerrar')).not.toBeInTheDocument()
    expect(screen.getByText('Cursando')).toBeInTheDocument()
  })

  it('reads a subject waiting on a final as final pendiente', () => {
    renderList([
      { ...base, periodId: 1, period: finishedPeriod, outcome: 'finalPendiente', finals: [{ result: 'reprobado' }] }
    ])

    expect(screen.getByText('Final pendiente')).toBeInTheDocument()
  })

  it('reads a subject that passed one of its finals as aprobada', () => {
    renderList([
      {
        ...base,
        periodId: 1,
        period: finishedPeriod,
        outcome: 'finalPendiente',
        finals: [{ result: 'reprobado' }, { result: 'aprobado' }]
      }
    ])

    expect(screen.getByText('Aprobada')).toBeInTheDocument()
  })

  it('reports the selected subject', async () => {
    const onSelect = vi.fn()
    renderList([base], onSelect)

    await userEvent.click(screen.getByRole('button', { name: /Derecho Constitucional/ }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })
})

// The carrera detail renders the same list compact (approved design — same
// layout language as its periods list): one meta line built from the same
// sources as the table cells, no column header row.
describe('MateriasList — compact (carrera detail)', () => {
  it('merges the table columns into one meta line and drops the header row', () => {
    render(<MateriasList subjects={[base]} now={today} compact />)

    expect(screen.getByText('Derecho Constitucional')).toBeInTheDocument()
    expect(screen.getByText('DC-201 · 2do Cuatrimestre 2026 · 75% requerido · Sin pendientes')).toBeInTheDocument()
    expect(screen.queryByText('MATERIA')).not.toBeInTheDocument()
    expect(screen.queryByText('HORARIO SEMANAL')).not.toBeInTheDocument()
  })

  it('prints Libre and the pending count from the same sources as the table', () => {
    render(
      <MateriasList subjects={[{ ...base, attendanceMinPercent: null, pendingDeadlines: 2 }]} now={today} compact />
    )

    expect(screen.getByText('DC-201 · 2do Cuatrimestre 2026 · Libre · 2 pendientes')).toBeInTheDocument()
  })

  it('keeps the estado badge and the click-through', async () => {
    const onSelect = vi.fn()
    render(<MateriasList subjects={[base]} now={today} onSelect={onSelect} compact />)

    expect(screen.getByText('Cursando')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Derecho Constitucional/ }))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('renders plain rows when no onSelect is given, same rule as the table', () => {
    render(<MateriasList subjects={[base]} now={today} compact />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('MateriasList — pendientes', () => {
  it('counts the open deadlines the payload reported', () => {
    renderList([{ ...base, pendingDeadlines: 2 }])

    expect(screen.getByText('2 pendientes')).toBeInTheDocument()
  })

  it('says so when the subject has nothing open', () => {
    renderList([{ ...base, pendingDeadlines: 0 }])

    expect(screen.getByText('Sin pendientes')).toBeInTheDocument()
  })

  it('keeps the singular for exactly one', () => {
    renderList([{ ...base, pendingDeadlines: 1 }])

    expect(screen.getByText('1 pendiente')).toBeInTheDocument()
  })

  // A closed subject has no coursework left to owe — a PENDIENTES count on it
  // (even "Sin pendientes") would read as something still expected of you.
  it('drops the count entirely once the subject is closed', () => {
    renderList([{ ...base, periodId: 1, period: finishedPeriod, outcome: 'aprobada', pendingDeadlines: 2 }])

    expect(screen.queryByText('2 pendientes')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin pendientes')).not.toBeInTheDocument()
  })

  it('drops the count for a subject waiting on its final', () => {
    renderList([
      { ...base, periodId: 1, period: finishedPeriod, outcome: 'finalPendiente', finals: [], pendingDeadlines: 3 }
    ])

    expect(screen.queryByText('3 pendientes')).not.toBeInTheDocument()
  })

  it('keeps the count while the ended period is still sin cerrar — work may still be owed', () => {
    renderList([{ ...base, periodId: 1, period: finishedPeriod, outcome: null, pendingDeadlines: 2 }])

    expect(screen.getByText('2 pendientes')).toBeInTheDocument()
  })

  it('drops the pendientes segment from the compact meta line too', () => {
    render(
      <MateriasList
        subjects={[{ ...base, periodId: 1, period: finishedPeriod, outcome: 'aprobada', pendingDeadlines: 2 }]}
        now={today}
        compact
      />
    )

    expect(screen.getByText('DC-201 · 1er Cuatrimestre 2026 · 75% requerido')).toBeInTheDocument()
  })
})
