import { describe, expect, it } from 'vitest'
import { buildAppContext, type AppContext } from './appContext'

// The app's own rows, rendered for the prompt. This is the seam an MCP server
// will eventually replace, so the tests pin WHAT the model gets to see rather
// than any particular formatting flourish.
function context(overrides: Partial<AppContext> = {}): AppContext {
  return { subjects: [], deadlines: [], finals: [], periods: [], ...overrides }
}

const algebra = {
  name: 'Álgebra',
  code: 'MAT-101',
  docente: 'Dra. Pérez',
  notas: 'Traer calculadora al parcial',
  attendanceMinPercent: 75,
  slots: [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 540, location: 'Aula 3' }]
}

describe('buildAppContext', () => {
  // An empty app is a valid state, not a failure: the caller still asks, and
  // the answer comes back marked `general`.
  it('returns an empty string when the app holds nothing', () => {
    expect(buildAppContext(context())).toBe('')
  })

  it('lists a subject with its code, docente, attendance floor and notes', () => {
    const result = buildAppContext(context({ subjects: [algebra] }))

    expect(result).toContain('Álgebra (MAT-101)')
    expect(result).toContain('Dra. Pérez')
    expect(result).toContain('75%')
    expect(result).toContain('Traer calculadora al parcial')
  })

  // A professor's phone or email is a THIRD PARTY's personal data, not the
  // student's, so it is not part of the context shape at all — this test
  // guards the omission by proving the field never reaches the text.
  it('never carries a contacto field, because the shape has none', () => {
    const withContacto = { ...algebra, contacto: 'perez@uni.edu · 11-5555-5555' }
    const result = buildAppContext(context({ subjects: [withContacto] }))

    expect(result).not.toContain('perez@uni.edu')
    expect(result).not.toContain('11-5555-5555')
  })

  it('renders schedule slots as readable day and time ranges', () => {
    const result = buildAppContext(context({ subjects: [algebra] }))

    expect(result).toContain('HORARIO')
    expect(result).toContain('lunes 08:00-09:00')
    expect(result).toContain('Aula 3')
  })

  it('omits a subject with no slots from the schedule section', () => {
    const result = buildAppContext(context({ subjects: [{ ...algebra, slots: [] }] }))

    expect(result).not.toContain('HORARIO')
  })

  it('marks each deadline as done or pending', () => {
    const result = buildAppContext(
      context({
        deadlines: [
          { title: 'TP 2', type: 'Trabajo práctico', dueAt: '2027-08-22T23:59', done: false, subjectName: 'SO' },
          { title: 'TP 1', type: 'Trabajo práctico', dueAt: '2027-08-01T23:59', done: true, subjectName: 'SO' }
        ]
      })
    )

    expect(result).toContain('TP 2')
    expect(result).toContain('pendiente')
    expect(result).toContain('hecha')
  })

  it('includes finals with their result, and the date only when there is one', () => {
    const result = buildAppContext(
      context({
        finals: [
          { subjectName: 'Álgebra', label: 'Diciembre 2027', takenOn: '2027-12-15', result: 'aprobado' },
          { subjectName: 'Física', label: 'Marzo 2028', takenOn: null, result: 'pendiente' }
        ]
      })
    )

    expect(result).toContain('Álgebra · Diciembre 2027 · aprobado · 2027-12-15')
    expect(result).toContain('Física · Marzo 2028 · pendiente')
  })

  it('includes periods with their program and dates', () => {
    const result = buildAppContext(
      context({ periods: [{ programName: 'Abogacía', name: '2do cuatri', startsOn: '2027-08-01', endsOn: null }] })
    )

    expect(result).toContain('Abogacía · 2do cuatri · 2027-08-01')
  })

  // Each section header only appears when it has content, so an app with just
  // one subject does not hand the model four empty headings to reason about.
  it('omits every section that has no rows', () => {
    const result = buildAppContext(context({ subjects: [{ ...algebra, slots: [] }] }))

    expect(result).toContain('MATERIAS')
    expect(result).not.toContain('ENTREGAS')
    expect(result).not.toContain('FINALES')
    expect(result).not.toContain('CARRERAS')
  })
})
