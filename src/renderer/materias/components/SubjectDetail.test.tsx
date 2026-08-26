// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { SubjectDetail } from './SubjectDetail'

const baseSubject: SubjectDetailResult = {
  id: 1,
  name: 'Algoritmos',
  code: 'ALG-101',
  color: '#7c3aed',
  docente: 'Dra. Pérez',
  contacto: null,
  comision: null,
  aula: null,
  campusUrl: 'https://campus.uni.edu/course/1',
  groupUrl: null,
  notas: 'Trae **calculadora**',
  attendanceMinPercent: 75,
  periodId: null,
  outcome: null,
  grade: null,
  regularity: null,
  slots: [
    { id: 1, subjectId: 1, dayOfWeek: 0, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }, // Sunday
    { id: 2, subjectId: 1, dayOfWeek: 3, startMinutes: 480, endMinutes: 540, location: 'Aula 1' } // Wednesday
  ],
  deadlines: [
    { id: 1, subjectId: 1, title: 'TP1', type: 'tp', dueAt: '2026-04-01T23:59', done: true },
    { id: 2, subjectId: 1, title: 'TP2', type: 'tp', dueAt: '2026-04-08T23:59', done: false },
    { id: 3, subjectId: 1, title: 'TP3', type: 'tp', dueAt: '2026-04-15T23:59', done: false },
    { id: 4, subjectId: 1, title: 'TP4', type: 'tp', dueAt: '2026-04-22T23:59', done: false }
  ],
  period: null,
  program: null,
  finals: [],
  parciales: [],
  attendance: [],
  classNotes: [],
  prerequisites: []
}

describe('SubjectDetail (read-only)', () => {
  /*
   * Deadline status wording must come from the entregas domain, not from a
   * local copy. This screen used to hand-roll its own formatter that said
   * "Vencida" while Entregas said "N días de atraso" for the same deadline —
   * two formatters that had already diverged once.
   */
  it('labels an overdue deadline with the same wording Entregas uses', () => {
    const overdue: SubjectDetailResult = {
      ...baseSubject,
      deadlines: [{ id: 9, subjectId: 1, title: 'TP atrasado', type: 'tp', dueAt: '2026-04-01T23:59', done: false }]
    }

    render(
      <SubjectDetail
        subject={overdue}
        nextClass={new Date('2026-04-04T09:00:00')}
        progreso={{ done: 0, total: 1 }}
        weeklyMinutes={120}
        now={new Date('2026-04-04T09:00:00')}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.getByText('3 días de atraso')).toBeInTheDocument()
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument()
  })

  it('uses the singular form for a deadline one day overdue', () => {
    const overdue: SubjectDetailResult = {
      ...baseSubject,
      deadlines: [{ id: 9, subjectId: 1, title: 'TP atrasado', type: 'tp', dueAt: '2026-04-01T23:59', done: false }]
    }

    render(
      <SubjectDetail
        subject={overdue}
        nextClass={new Date('2026-04-02T09:00:00')}
        progreso={{ done: 0, total: 1 }}
        weeklyMinutes={120}
        now={new Date('2026-04-02T09:00:00')}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.getByText('1 día de atraso')).toBeInTheDocument()
  })

  it('grades deadline status pills by urgency and never paints them violet (violet is interaction-only)', () => {
    const graded: SubjectDetailResult = {
      ...baseSubject,
      deadlines: [
        { id: 1, subjectId: 1, title: 'TP0', type: 'tp', dueAt: '2026-04-01T23:59', done: false }, // overdue
        { id: 2, subjectId: 1, title: 'TP1', type: 'tp', dueAt: '2026-04-05T23:59', done: false }, // imminent
        { id: 3, subjectId: 1, title: 'TP2', type: 'tp', dueAt: '2026-04-09T23:59', done: false }, // this week
        { id: 4, subjectId: 1, title: 'TP3', type: 'tp', dueAt: '2026-04-20T23:59', done: false }, // later
        { id: 5, subjectId: 1, title: 'TP4', type: 'tp', dueAt: '2026-04-02T23:59', done: true } // completed
      ]
    }

    render(
      <SubjectDetail
        subject={graded}
        nextClass={null}
        progreso={{ done: 1, total: 5 }}
        weeklyMinutes={120}
        now={new Date('2026-04-04T09:00:00')}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.getByText('3 días de atraso')).toHaveClass('bg-(--color-urgent-soft)', 'text-(--color-urgent)')
    expect(screen.getByText('Mañana')).toHaveClass('bg-(--color-warn-soft)', 'text-(--color-warn)')
    expect(screen.getByText('En 5 días')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-secondary)')
    expect(screen.getByText('En 2 semanas')).toHaveClass('bg-(--color-surface-sunken)', 'text-(--color-ink-muted)')
    expect(screen.getByText('Completada')).toHaveClass('bg-muted', 'text-muted-foreground')
    for (const row of screen.getAllByTestId('subject-detail-deadline')) {
      expect(row.innerHTML).not.toContain('violet')
    }
  })

  it('renders "Agregar entrega" in the ENTREGAS section header and calls onAddEntrega (amendment 8, design node l4Wr1F: heading left, button right)', () => {
    const onAddEntrega = vi.fn()
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={new Date('2026-03-06T09:00:00')}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={onAddEntrega}
        onCloseSubject={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agregar entrega' }))
    expect(onAddEntrega).toHaveBeenCalledTimes(1)
  })

  it('renders progreso as done/total (spec: "Progreso reflects deadline completion ratio")', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={new Date('2026-03-06T09:00:00')}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    // Design node `o8ro4` (right column "PROGRESO" card) spells this "N de
    // M", not "N/M" — verified against the .pen file via the Pencil MCP
    // tools.
    expect(screen.getByText('1 de 4')).toBeInTheDocument()
  })

  it('renders horas/semana formatted from total minutes', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    // Design node `O76IVz` (right column stats block) pairs the "Horas por
    // semana" KEY with a bare "N h" VALUE — the "/semana" suffix is already
    // carried by the key, so the value never repeats it.
    expect(screen.getByText('2 h')).toBeInTheDocument()
  })

  it('shows a "no classes scheduled" message when próxima clase is null', () => {
    render(
      <SubjectDetail
        subject={{ ...baseSubject, slots: [] }}
        nextClass={null}
        progreso={{ done: 0, total: 0 }}
        weeklyMinutes={0}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.getByText('Sin clases programadas')).toBeInTheDocument()
  })

  it('renders notas as raw plain text — markdown syntax is never rendered as formatting', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    const notasValue = screen.getByTestId('subject-detail-notas')
    expect(notasValue).toHaveTextContent('Trae **calculadora**')
    expect(notasValue.querySelector('strong, b, em, i')).toBeNull()
  })

  it('renders the campusUrl affordance as a BUTTON (never a raw <a href>) and forwards the click', () => {
    const onOpenExternalUrl = vi.fn()
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={onOpenExternalUrl}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    const campusButton = screen.getByRole('button', { name: /campus/i })
    expect(campusButton.tagName).toBe('BUTTON')
    expect(document.querySelector('a[href]')).not.toBeInTheDocument()

    fireEvent.click(campusButton)

    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://campus.uni.edu/course/1')
  })

  it('renders no campus link affordance when campusUrl is absent', () => {
    render(
      <SubjectDetail
        subject={{ ...baseSubject, campusUrl: null }}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /campus/i })).not.toBeInTheDocument()
  })

  it('lists slots in Monday-first order even though Sunday is stored as dayOfWeek=0', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    const items = screen.getAllByTestId('subject-detail-slot')
    expect(items[0]).toHaveTextContent('Miércoles')
    expect(items[1]).toHaveTextContent('Domingo')
  })

  it('has no editable input fields — the only write affordance is elsewhere ("Editar materia")', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('"Materias" back link calls onBack, and "Editar materia" calls onEdit (design: header owns both)', () => {
    const onBack = vi.fn()
    const onEdit = vi.fn()
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={onBack}
        onEdit={onEdit}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Materias' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Editar materia' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  // The NOTAS section used to carry its own "Editar materia" ghost button;
  // the approved compaction removed it, so the header button is the ONLY
  // whole-subject edit entry point on this screen.
  it('the header holds the only "Editar materia" button — the NOTAS section has none', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )

    expect(screen.getAllByRole('button', { name: 'Editar materia' })).toHaveLength(1)
  })

  // The detail screen is the ONLY place a subject can be closed: the Materias
  // list used to own that action behind a banner that appeared only once the
  // period had ended, which made closing unreachable during the cursada and
  // left the finales section permanently out of reach with it.
  it('"Cerrar materia" is offered in the header regardless of the period, and calls onCloseSubject', () => {
    const onCloseSubject = vi.fn()
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={onCloseSubject}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar materia' }))

    expect(onCloseSubject).toHaveBeenCalledTimes(1)
  })

  // Ficha de cátedra (approved design): the CÁTEDRA card grows Comisión and
  // Aula as plain value rows and Grupo as a second external-link row, in the
  // exact order Docente, Contacto, Comisión, Aula, Campus, Grupo.
  describe('Cátedra card (ficha de cátedra)', () => {
    const fichaSubject: SubjectDetailResult = {
      ...baseSubject,
      contacto: 'perez@uni.edu',
      comision: 'K2051',
      aula: 'Lab 3 · Edificio B',
      groupUrl: 'https://chat.whatsapp.com/AbC123'
    }

    function renderDetail(subject: SubjectDetailResult, onOpenExternalUrl = vi.fn()) {
      render(
        <SubjectDetail
          subject={subject}
          nextClass={null}
          progreso={{ done: 1, total: 4 }}
          weeklyMinutes={120}
          onOpenExternalUrl={onOpenExternalUrl}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onAddEntrega={vi.fn()}
          onCloseSubject={vi.fn()}
        />
      )
    }

    it('renders the six rows in order: Docente, Contacto, Comisión, Aula, Campus, Grupo', () => {
      renderDetail(fichaSubject)

      const rowLabels = ['Docente', 'Contacto', 'Comisión', 'Aula', 'Campus', 'Grupo'].map((label) =>
        screen.getByText(label)
      )
      for (let index = 0; index < rowLabels.length - 1; index += 1) {
        const position = rowLabels[index]!.compareDocumentPosition(rowLabels[index + 1]!)
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
    })

    it('renders comisión and aula as plain values', () => {
      renderDetail(fichaSubject)

      expect(screen.getByText('K2051')).toBeInTheDocument()
      expect(screen.getByText('Lab 3 · Edificio B')).toBeInTheDocument()
    })

    it('mirrors the existing empty-field placeholder (—) for empty comisión, aula and grupo', () => {
      renderDetail({ ...baseSubject, contacto: null, comision: null, aula: null, campusUrl: null, groupUrl: null })

      // contacto + comisión + aula + campus + grupo — docente stays filled.
      expect(screen.getAllByText('—')).toHaveLength(5)
    })

    it('renders the Grupo row as an external-link BUTTON labeled by the URL host and forwards the click', () => {
      const onOpenExternalUrl = vi.fn()
      renderDetail(fichaSubject, onOpenExternalUrl)

      const groupButton = screen.getByRole('button', { name: 'Abrir grupo del curso' })
      expect(groupButton.tagName).toBe('BUTTON')
      expect(groupButton).toHaveTextContent('WhatsApp')
      expect(document.querySelector('a[href]')).not.toBeInTheDocument()

      fireEvent.click(groupButton)

      expect(onOpenExternalUrl).toHaveBeenCalledWith('https://chat.whatsapp.com/AbC123')
    })

    it('falls back to the generic group label when the host is not a known chat platform', () => {
      renderDetail({ ...fichaSubject, groupUrl: 'https://groups.google.com/g/algoritmos' })

      expect(screen.getByRole('button', { name: 'Abrir grupo del curso' })).toHaveTextContent('Chat del curso')
    })

    it('renders no group link affordance when groupUrl is absent', () => {
      renderDetail({ ...fichaSubject, groupUrl: null })

      expect(screen.queryByRole('button', { name: 'Abrir grupo del curso' })).not.toBeInTheDocument()
    })
  })
})

// The condición is the faculty's verdict, STORED and never derived from the
// parciales — so the header only ever reports what was recorded, and stays
// completely silent (no "sin definir" chip) when nothing was.
describe('SubjectDetail — regularidad badge', () => {
  function renderDetail(subject: SubjectDetailResult) {
    return render(
      <SubjectDetail
        subject={subject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )
  }

  it('reports the declared condición next to the código and the asistencia', () => {
    renderDetail({ ...baseSubject, regularity: 'promocionada' })

    expect(screen.getByText('Promocionada')).toBeInTheDocument()
    expect(screen.getByTestId('subject-detail-regularity-separator')).toBeInTheDocument()
  })

  it('renders neither the badge nor its separator when no condición is declared', () => {
    renderDetail({ ...baseSubject, regularity: null })

    expect(screen.queryByText('Regular')).not.toBeInTheDocument()
    expect(screen.queryByText('Promocionada')).not.toBeInTheDocument()
    expect(screen.queryByText('Libre')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subject-detail-regularity-separator')).not.toBeInTheDocument()
  })
})

// The ASISTENCIA card (approved design: right column, between PROGRESO and the
// numbers card). Everything it shows is DERIVED from the marks at render time
// — nothing about a percentage is stored.
describe('SubjectDetail — asistencia card', () => {
  function renderWithAttendance(overrides: Partial<SubjectDetailResult>) {
    render(
      <SubjectDetail
        subject={{ ...baseSubject, ...overrides }}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )
  }

  function marks(...statuses: Array<'presente' | 'ausente' | 'feriado'>) {
    return statuses.map((status, index) => ({
      id: index + 1,
      subjectId: 1,
      date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      status
    }))
  }

  it('reads the count, the percentage and the minimum it is measured against', () => {
    renderWithAttendance({ attendance: marks('presente', 'presente', 'presente', 'ausente') })

    expect(screen.getByText('ASISTENCIA')).toBeInTheDocument()
    expect(screen.getByText('3 de 4')).toBeInTheDocument()
    expect(screen.getByText('75% presente · mínimo requerido 75%')).toBeInTheDocument()
  })

  it('fills the track proportionally and in the ok tone while the minimum is met', () => {
    renderWithAttendance({ attendance: marks('presente', 'presente', 'presente', 'ausente') })

    const fill = screen.getByTestId('subject-detail-attendance-fill')
    expect(fill).toHaveStyle({ width: '75%' })
    expect(fill).toHaveClass('bg-(--color-ok)')
  })

  it('turns urgent once the subject is below its minimum', () => {
    renderWithAttendance({ attendance: marks('presente', 'ausente') })

    expect(screen.getByText('50% presente · mínimo requerido 75%')).toBeInTheDocument()
    expect(screen.getByTestId('subject-detail-attendance-fill')).toHaveClass('bg-(--color-urgent)')
  })

  // A subject that declares no minimum makes no claim to fall short of, so the
  // card reports the number with a neutral bar and no "mínimo" clause.
  it('drops the mínimo clause and stays neutral when the subject declares none', () => {
    renderWithAttendance({ attendanceMinPercent: null, attendance: marks('presente', 'ausente') })

    expect(screen.getByText('50% presente')).toBeInTheDocument()
    expect(screen.queryByText(/mínimo requerido/)).not.toBeInTheDocument()
    expect(screen.getByTestId('subject-detail-attendance-fill')).toHaveClass('bg-primary')
  })

  // NOT "0% presente" and not "0 de 0": with nothing counted the question has
  // not been answered yet, and a 0 would read as a catastrophe.
  it('renders a distinct empty state instead of a misleading 0%', () => {
    renderWithAttendance({ attendance: [] })

    expect(screen.getByText('Todavía no hay asistencia para calcular')).toBeInTheDocument()
    expect(screen.queryByText(/% presente/)).not.toBeInTheDocument()
    expect(screen.queryByText('0 de 0')).not.toBeInTheDocument()
  })

  it('treats a subject with only feriados as unmeasured, not as 0%', () => {
    renderWithAttendance({ attendance: marks('feriado', 'feriado') })

    expect(screen.getByText('Todavía no hay asistencia para calcular')).toBeInTheDocument()
  })

  // The minimum now lives INSIDE the bar that measures against it; repeating it
  // in the numbers card said the same fact twice.
  it('no longer repeats the minimum as a row in the numbers card', () => {
    renderWithAttendance({})

    expect(screen.queryByText('Asistencia mínima')).not.toBeInTheDocument()
  })

  it('sits between the progreso card and the numbers card', () => {
    renderWithAttendance({})

    const progreso = screen.getByText('PROGRESO')
    const asistencia = screen.getByTestId('subject-detail-attendance')
    const numbers = screen.getByText('Horas por semana')

    expect(progreso.compareDocumentPosition(asistencia) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(asistencia.compareDocumentPosition(numbers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The APUNTES DE CLASE section owns the class dialog and its mutations, so it
// arrives as a slot the same way ADJUNTOS does.
describe('SubjectDetail — apuntes slot', () => {
  it('renders the injected section between NOTAS and ADJUNTOS', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
        apuntesSlot={<div data-testid="apuntes-slot" />}
        adjuntosSlot={<div data-testid="adjuntos-slot" />}
      />
    )

    const notas = screen.getByText('NOTAS')
    const apuntes = screen.getByTestId('apuntes-slot')
    const adjuntos = screen.getByTestId('adjuntos-slot')

    expect(notas.compareDocumentPosition(apuntes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(apuntes.compareDocumentPosition(adjuntos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The PARCIALES section owns its own mutations, so it arrives as a slot the
// same way ADJUNTOS does — this screen only reserves its position.
describe('SubjectDetail — parciales slot', () => {
  it('renders the injected section between ENTREGAS and NOTAS', () => {
    render(
      <SubjectDetail
        subject={baseSubject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
        parcialesSlot={<div data-testid="parciales-slot" />}
      />
    )

    const entregas = screen.getByText('ENTREGAS')
    const parciales = screen.getByTestId('parciales-slot')
    const notas = screen.getByText('NOTAS')

    expect(entregas.compareDocumentPosition(parciales) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(parciales.compareDocumentPosition(notas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// The card itself is covered in `planificador/components/CorrelativasCard.test.tsx`;
// these two pin the WIRING — that this screen hands it the detail payload's
// rows, and that it sits after the Cátedra card in the right column.
describe('SubjectDetail — correlativas card', () => {
  function renderDetail(subject: SubjectDetailResult) {
    return render(
      <SubjectDetail
        subject={subject}
        nextClass={null}
        progreso={{ done: 1, total: 4 }}
        weeklyMinutes={120}
        onOpenExternalUrl={vi.fn()}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onAddEntrega={vi.fn()}
        onCloseSubject={vi.fn()}
      />
    )
  }

  it('renders no card at all when the materia has no correlativas', () => {
    renderDetail({ ...baseSubject, prerequisites: [] })

    expect(screen.queryByText('CORRELATIVAS')).not.toBeInTheDocument()
  })

  it('renders the card after the Cátedra card once there is one', () => {
    renderDetail({
      ...baseSubject,
      prerequisites: [
        {
          id: 1,
          subjectId: 1,
          requiredLevel: 'aprobada',
          requires: { id: 2, name: 'Álgebra I', outcome: 'aprobada', regularity: null, finals: [] }
        }
      ]
    })

    const catedra = screen.getByText('Docente')
    const correlativas = screen.getByText('CORRELATIVAS')

    expect(screen.getByText('Álgebra I')).toBeInTheDocument()
    expect(screen.getByText('Cumplida')).toBeInTheDocument()
    expect(catedra.compareDocumentPosition(correlativas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
