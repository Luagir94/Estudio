// @vitest-environment jsdom
//
// Guard for spec "subject-registry / notas Field Cap / No attachment or
// search affordance exists" (spec #106) and proposal Out of Scope:
// "Formatted notes, rich text, file attachments, note search" (proposal
// #90 — risk table: "Scope creep toward notes... a written non-goal is not
// a control"). RED here means a file-attach, search, or rich-text control
// landed on a notas-hosting surface — revert it, don't adjust this test.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'
import type { SubjectDetailResult } from '../../../shared/ipc/materias'
import { EditarMateriaModal } from './EditarMateriaModal'
import { NuevaMateriaModal } from './NuevaMateriaModal'
import { SubjectDetail } from './SubjectDetail'

const programs: ProgramWithPeriods[] = [
  {
    id: 1,
    name: 'Abogacía',
    institution: null,
    color: '#4C8DFF',
    gradingScheme: 'numerico',
    gradeScale: 10,
    periods: [
      { id: 7, programId: 1, name: '1C 2026', kind: 'cuatrimestre', startsOn: '2026-03-09', endsOn: '2026-07-18' }
    ],
    subjectCount: 0,
    gradedSubjects: []
  }
]

const subject: SubjectDetailResult = {
  id: 1,
  name: 'Algoritmos',
  code: 'ALG-101',
  color: '#7c3aed',
  docente: 'Dra. Pérez',
  contacto: null,
  comision: null,
  aula: null,
  campusUrl: null,
  groupUrl: null,
  notas: 'Trae calculadora',
  attendanceMinPercent: null,
  periodId: null,
  outcome: null,
  grade: null,
  slots: [{ id: 1, subjectId: 1, dayOfWeek: 1, startMinutes: 600, endMinutes: 660, location: 'Aula 4' }],
  deadlines: [],
  period: null,
  program: null,
  finals: []
}

// Spec's THEN reads "present anywhere in the app" — check the whole
// surface, not just the notas field's DOM neighbourhood.
function assertNoAttachmentOrSearchAffordance(container: HTMLElement): void {
  expect(
    container.querySelector('input[type="file"]'),
    'notas Field Cap violated: found <input type="file">. Attachments are Out of Scope — revert or amend the spec.'
  ).toBeNull()
  expect(
    container.querySelector('input[type="search"], [role="search"], [role="searchbox"]'),
    'notas Field Cap violated: found a search control. Note search is Out of Scope — revert or amend the spec.'
  ).toBeNull()
}

describe('notas non-goal guard (proposal risk: "Scope creep toward notes")', () => {
  it('the "Nueva materia" creation form has no attachment or search control', () => {
    const { container } = render(
      <NuevaMateriaModal programs={programs} defaultPeriodId={7} onSubmit={vi.fn()} onClose={vi.fn()} />
    )
    assertNoAttachmentOrSearchAffordance(container)
  })

  it('the "Editar materia" form has no attachment/search control, and notas stays a plain <textarea>', () => {
    const { container } = render(<EditarMateriaModal subject={subject} onSubmit={vi.fn()} onClose={vi.fn()} />)
    assertNoAttachmentOrSearchAffordance(container)

    expect(
      screen.getByLabelText('Notas').tagName,
      'notas Field Cap violated: "Notas" is no longer a plain <textarea>. Rich text is Out of Scope.'
    ).toBe('TEXTAREA')
  })

  it('the subject detail screen has no attachment or search control near notas', () => {
    const { container } = render(
      <SubjectDetail
        subject={subject}
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
    assertNoAttachmentOrSearchAffordance(container)
  })
})
