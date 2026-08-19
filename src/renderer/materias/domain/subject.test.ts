import { describe, expect, it } from 'vitest'
import { createSubject } from './subject'

describe('createSubject validation', () => {
  it('rejects a payload missing name, code, and color', () => {
    const result = createSubject({})

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected validation failure')
    const paths = result.errors.map((issue) => issue.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['name', 'code', 'color']))
  })

  it('accepts a payload with only the required fields, leaving optional fields undefined', () => {
    const result = createSubject({ name: 'Algoritmos', code: 'ALG-101', color: '#7c3aed' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected validation success')
    expect(result.subject).toEqual({
      name: 'Algoritmos',
      code: 'ALG-101',
      color: '#7c3aed'
    })
  })

  it('accepts all optional fields explicitly set to null', () => {
    const result = createSubject({
      name: 'Bases de Datos',
      code: 'BD-201',
      color: '#22c55e',
      docente: null,
      contacto: null,
      campusUrl: null,
      notas: null,
      attendanceMinPercent: null
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected validation success')
    expect(result.subject.docente).toBeNull()
    expect(result.subject.contacto).toBeNull()
    expect(result.subject.campusUrl).toBeNull()
    expect(result.subject.notas).toBeNull()
    expect(result.subject.attendanceMinPercent).toBeNull()
  })

  it('rejects an attendanceMinPercent outside the 0-100 range', () => {
    const result = createSubject({
      name: 'Redes',
      code: 'RED-301',
      color: '#f97316',
      attendanceMinPercent: 150
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected validation failure')
    expect(result.errors.some((issue) => issue.path.join('.') === 'attendanceMinPercent')).toBe(true)
  })
})
