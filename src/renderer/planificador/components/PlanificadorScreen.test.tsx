// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlannablePeriod } from '../domain/plannablePeriods'
import type { Candidate, EligibilitySubject } from '../domain/requirements'
import type { DraftSubject } from '../domain/draftSchedule'
import { PlanificadorScreen } from './PlanificadorScreen'

const MONDAY = 1
const WEDNESDAY = 3

let nextSlotId = 1

function slot(dayOfWeek: number, startMinutes: number, endMinutes: number) {
  return { id: nextSlotId++, subjectId: 0, dayOfWeek, startMinutes, endMinutes, location: null }
}

function eligible(id: number, name: string, code: string, slots = [slot(MONDAY, 1080, 1260)]): EligibilitySubject {
  return { id, name, code, color: '#fff', outcome: null, regularity: null, finals: [], slots, prerequisites: [] }
}

function candidate(subject: EligibilitySubject, unmet: Candidate['unmet'] = []): Candidate {
  return { subject, state: unmet.length === 0 ? 'habilitada' : 'bloqueada', unmet }
}

function draftSubject(id: number, name: string, slots: ReturnType<typeof slot>[]): DraftSubject {
  return { id, name, color: '#fff', slots }
}

const PERIODS: PlannablePeriod[] = [
  { id: 2, name: '1er Cuatrimestre 2027', startsOn: '2027-03-01', endsOn: '2027-07-31', programName: 'Ingeniería' }
]

type ScreenProps = Parameters<typeof PlanificadorScreen>[0]

function renderScreen(overrides: Partial<ScreenProps> = {}) {
  const handlers = { onSelectPeriod: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() }
  const props = (extra: Partial<ScreenProps>): ScreenProps => ({
    periods: PERIODS,
    selectedPeriodId: 2,
    candidates: [],
    draft: [],
    clashes: [],
    load: { totalMinutes: 0, classCount: 0, subjectCount: 0 },
    ...handlers,
    ...extra
  })
  const view = render(<PlanificadorScreen {...props(overrides)} />)
  return {
    ...handlers,
    rerender: (next: Partial<ScreenProps>) => view.rerender(<PlanificadorScreen {...props(next)} />)
  }
}

describe('PlanificadorScreen', () => {
  it('names the screen and the período being planned', () => {
    renderScreen({ load: { totalMinutes: 18 * 60, classCount: 5, subjectCount: 3 } })

    expect(screen.getByRole('heading', { name: 'Planificador' })).toBeInTheDocument()
    expect(screen.getByText('1er Cuatrimestre 2027 · 3 en el borrador · 18 h por semana')).toBeInTheDocument()
  })

  it('offers the período switcher', async () => {
    const handlers = renderScreen({
      periods: [
        ...PERIODS,
        {
          id: 3,
          name: '2do Cuatrimestre 2027',
          startsOn: '2027-08-01',
          endsOn: '2027-12-20',
          programName: 'Ingeniería'
        }
      ]
    })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Período que estás planificando' }), '3')

    expect(handlers.onSelectPeriod).toHaveBeenCalledWith(3)
  })

  describe('disponibles para cursar', () => {
    it('lists a habilitada materia with its code, weekly hours and days', () => {
      renderScreen({
        candidates: [
          candidate(
            eligible(1, 'Análisis Matemático II', 'MAT-201', [slot(MONDAY, 1080, 1260), slot(WEDNESDAY, 1080, 1260)])
          )
        ]
      })

      expect(screen.getByText('Análisis Matemático II')).toBeInTheDocument()
      expect(screen.getByText('MAT-201 · 6 h por semana · Lun y Mié')).toBeInTheDocument()
      expect(screen.getByText('Habilitada')).toBeInTheDocument()
    })

    it('offers a button that drafts a habilitada materia', async () => {
      const handlers = renderScreen({ candidates: [candidate(eligible(1, 'Física I', 'FIS-101'))] })

      await userEvent.click(screen.getByRole('button', { name: 'Agregar Física I al borrador' }))

      expect(handlers.onAdd).toHaveBeenCalledWith(1)
    })

    // The approved design prints the reason on its own line, in urgent —
    // "Bloqueada" alone tells the student nothing they can act on.
    it('prints which correlativa is missing, at which level', () => {
      renderScreen({
        candidates: [
          candidate(eligible(3, 'Estructuras de Datos', 'INF-202'), [
            { subjectId: 1, subjectName: 'Algoritmos I', requiredLevel: 'aprobada' }
          ])
        ]
      })

      expect(screen.getByText('Bloqueada')).toBeInTheDocument()
      expect(screen.getByText('Falta Algoritmos I aprobada')).toBeInTheDocument()
    })

    it('prints the regularizada level verbatim too', () => {
      renderScreen({
        candidates: [
          candidate(eligible(4, 'Probabilidad y Estadística', 'MAT-210'), [
            { subjectId: 2, subjectName: 'Análisis Matemático II', requiredLevel: 'regularizada' }
          ])
        ]
      })

      expect(screen.getByText('Falta Análisis Matemático II regularizada')).toBeInTheDocument()
    })

    it('lists every missing correlativa, not only the first', () => {
      renderScreen({
        candidates: [
          candidate(eligible(4, 'Probabilidad', 'MAT-210'), [
            { subjectId: 1, subjectName: 'Algoritmos I', requiredLevel: 'aprobada' },
            { subjectId: 2, subjectName: 'Análisis Matemático II', requiredLevel: 'regularizada' }
          ])
        ]
      })

      expect(screen.getByText('Falta Algoritmos I aprobada')).toBeInTheDocument()
      expect(screen.getByText('Falta Análisis Matemático II regularizada')).toBeInTheDocument()
    })

    // The lock is a statement, not a control: there is nothing to click, so
    // there is no button to tab into either.
    it('offers no add control on a bloqueada materia', () => {
      renderScreen({
        candidates: [
          candidate(eligible(3, 'Estructuras de Datos', 'INF-202'), [
            { subjectId: 1, subjectName: 'Algoritmos I', requiredLevel: 'aprobada' }
          ])
        ]
      })

      expect(screen.queryByRole('button', { name: /Agregar Estructuras de Datos/ })).not.toBeInTheDocument()
    })

    it('says so when there is nothing left to add', () => {
      renderScreen({ candidates: [] })

      expect(screen.getByText(/No hay materias para agregar/)).toBeInTheDocument()
    })

    it('reads a materia with no horario as such', () => {
      renderScreen({ candidates: [candidate(eligible(1, 'Sin horario', 'X-1', []))] })

      expect(screen.getByText('X-1 · sin horario cargado')).toBeInTheDocument()
    })
  })

  describe('tu borrador', () => {
    it('lists a drafted materia with its class times', () => {
      renderScreen({
        draft: [draftSubject(1, 'Análisis Matemático II', [slot(MONDAY, 1080, 1260), slot(WEDNESDAY, 1080, 1260)])]
      })

      // Read off the row, not one text node: each class is now its own span
      // so a collision can be marked on the hour that has it.
      expect(screen.getByTestId('planificador-draft-row')).toHaveTextContent('Lun 18:00–21:00 · Mié 18:00–21:00')
    })

    it('offers a button that takes a materia back out', async () => {
      const handlers = renderScreen({ draft: [draftSubject(1, 'Física I', [slot(2, 1140, 1260)])] })

      await userEvent.click(screen.getByRole('button', { name: 'Sacar Física I del borrador' }))

      expect(handlers.onRemove).toHaveBeenCalledWith(1)
    })

    it('says so when the draft is empty', () => {
      renderScreen({ draft: [] })

      expect(screen.getByText(/Tu borrador está vacío/)).toBeInTheDocument()
    })
  })

  describe('clashing hours', () => {
    // ITICS meets four times a week and collides on exactly one of them.
    // Painting all four said "this materia is a problem"; the design says
    // "this HOUR is".
    it('marks only the class that collides', () => {
      renderScreen({
        draft: [
          draftSubject(1, 'ITICS', [slot(MONDAY, 480, 540), slot(WEDNESDAY, 480, 540)]),
          draftSubject(2, 'Redes', [slot(MONDAY, 480, 540)])
        ],
        clashes: [
          {
            first: { id: 1, name: 'ITICS' },
            second: { id: 2, name: 'Redes' },
            dayOfWeek: MONDAY,
            startMinutes: 480,
            endMinutes: 540
          }
        ]
      })

      const rows = screen.getAllByTestId('planificador-draft-row')

      expect(within(rows[0]!).getByText('Lun 08:00–09:00')).toHaveClass('text-(--color-warn)')
      expect(within(rows[0]!).getByText('Mié 08:00–09:00')).not.toHaveClass('text-(--color-warn)')
    })

    it('leaves every hour quiet when nothing collides', () => {
      renderScreen({ draft: [draftSubject(1, 'ITICS', [slot(MONDAY, 480, 540)])], clashes: [] })

      expect(screen.getByText('Lun 08:00–09:00')).not.toHaveClass('text-(--color-warn)')
    })
  })

  describe('clash notice', () => {
    const CLASH = {
      first: { id: 1, name: 'Análisis' },
      second: { id: 2, name: 'Redes' },
      dayOfWeek: WEDNESDAY,
      startMinutes: 1140,
      endMinutes: 1260
    }
    const CLASHING_DRAFT = [
      draftSubject(1, 'Análisis', [slot(WEDNESDAY, 1080, 1260)]),
      draftSubject(2, 'Redes', [slot(WEDNESDAY, 1140, 1320)])
    ]

    it('names both materias and the overlapping window', () => {
      renderScreen({
        draft: [
          draftSubject(1, 'Análisis Matemático II', [slot(WEDNESDAY, 1080, 1260)]),
          draftSubject(2, 'Redes de Computadoras', [slot(WEDNESDAY, 1140, 1320)])
        ],
        clashes: [
          {
            first: { id: 1, name: 'Análisis Matemático II' },
            second: { id: 2, name: 'Redes de Computadoras' },
            dayOfWeek: WEDNESDAY,
            startMinutes: 1140,
            endMinutes: 1260
          }
        ]
      })

      expect(screen.getByText('Análisis Matemático II se superpone con Redes de Computadoras')).toBeInTheDocument()
      expect(
        screen.getByText('Miércoles 19:00–21:00. Podés dejarla igual: el planificador avisa, no decide.')
      ).toBeInTheDocument()
    })

    // The notice AVISA. It must never take the × away, hide the row, or stop
    // anything — that is the design's own promise, in the notice's own words.
    it('leaves the clashing row fully removable', async () => {
      const handlers = renderScreen({
        draft: [
          draftSubject(1, 'Análisis', [slot(WEDNESDAY, 1080, 1260)]),
          draftSubject(2, 'Redes', [slot(WEDNESDAY, 1140, 1320)])
        ],
        clashes: [
          {
            first: { id: 1, name: 'Análisis' },
            second: { id: 2, name: 'Redes' },
            dayOfWeek: WEDNESDAY,
            startMinutes: 1140,
            endMinutes: 1260
          }
        ]
      })

      await userEvent.click(screen.getByRole('button', { name: 'Sacar Redes del borrador' }))

      expect(handlers.onRemove).toHaveBeenCalledWith(2)
    })

    // And it must never stop a clashing materia from being ADDED in the first
    // place: the + on the left column is untouched by any clash.
    it('still offers to draft a materia that would clash', async () => {
      const handlers = renderScreen({
        candidates: [candidate(eligible(2, 'Redes', 'RED-1', [slot(WEDNESDAY, 1140, 1320)]))],
        draft: [draftSubject(1, 'Análisis', [slot(WEDNESDAY, 1080, 1260)])]
      })

      await userEvent.click(screen.getByRole('button', { name: 'Agregar Redes al borrador' }))

      expect(handlers.onAdd).toHaveBeenCalledWith(2)
    })

    it('shows nothing when the draft does not collide', () => {
      renderScreen({ draft: [draftSubject(1, 'Análisis', [slot(MONDAY, 1080, 1260)])], clashes: [] })

      expect(screen.queryByText(/se superpone con/)).not.toBeInTheDocument()
    })

    // An aviso you cannot put down is a nag. Closing one silences THAT
    // collision — and only while it lasts (see below).
    it('lets the student close the notice', async () => {
      renderScreen({ draft: CLASHING_DRAFT, clashes: [CLASH] })

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso de Análisis y Redes' }))

      expect(screen.queryByText(/se superpone con/)).not.toBeInTheDocument()
    })

    // Closing is the last thing on this screen that could be mistaken for a
    // decision, so it gets the same guard the rest of the notice has: it
    // silences a message, it does not touch the borrador.
    it('leaves the draft untouched when the notice is closed', async () => {
      const handlers = renderScreen({ draft: CLASHING_DRAFT, clashes: [CLASH] })

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso de Análisis y Redes' }))

      expect(handlers.onRemove).not.toHaveBeenCalled()
    })

    it('keeps the other notices open', async () => {
      const second = {
        first: { id: 1, name: 'Análisis' },
        second: { id: 3, name: 'Física' },
        dayOfWeek: MONDAY,
        startMinutes: 600,
        endMinutes: 660
      }
      renderScreen({ draft: CLASHING_DRAFT, clashes: [CLASH, second] })

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso de Análisis y Redes' }))

      expect(screen.getByText('Análisis se superpone con Física')).toBeInTheDocument()
    })

    // Silencing is not solving. The moment the overlap is actually gone the
    // silence expires with it, so the same pair colliding again is announced
    // again instead of staying quietly hidden.
    it('speaks up again when the same collision comes back', async () => {
      const { rerender } = renderScreen({ draft: CLASHING_DRAFT, clashes: [CLASH] })
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso de Análisis y Redes' }))

      rerender({ draft: CLASHING_DRAFT, clashes: [] })
      rerender({ draft: CLASHING_DRAFT, clashes: [CLASH] })

      expect(screen.getByText('Análisis se superpone con Redes')).toBeInTheDocument()
    })
  })

  describe('carga semanal', () => {
    it('reads the draft as hours, materias and classes', () => {
      renderScreen({ load: { totalMinutes: 18 * 60, classCount: 5, subjectCount: 3 } })

      const card = screen.getByTestId('planificador-weekly-load')

      expect(within(card).getByText('CARGA SEMANAL')).toBeInTheDocument()
      expect(within(card).getByText('18 h')).toBeInTheDocument()
      expect(within(card).getByText('3 materias · 5 clases por semana')).toBeInTheDocument()
    })

    it('says one materia and one class in the singular', () => {
      renderScreen({ load: { totalMinutes: 120, classCount: 1, subjectCount: 1 } })

      expect(screen.getByText('1 materia · 1 clase por semana')).toBeInTheDocument()
    })

    it('fills the track proportionally, never past its end', () => {
      renderScreen({ load: { totalMinutes: 60 * 60, classCount: 20, subjectCount: 9 } })

      expect(screen.getByTestId('planificador-weekly-load-fill')).toHaveStyle({ width: '100%' })
    })
  })

  it('explains itself when no período can be planned yet', () => {
    renderScreen({ periods: [], selectedPeriodId: null })

    expect(screen.getByText('Todavía no hay ningún período por delante')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
