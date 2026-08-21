import { describe, expect, it } from 'vitest'
import { buildMatchQuery } from './ftsQuery'

describe('buildMatchQuery', () => {
  it('splits a question into tokens, double-quotes each, and OR-joins them (design "MATCH construction")', () => {
    expect(buildMatchQuery('What is love')).toBe('"What" OR "is" OR "love"')
  })

  it('drops punctuation and collapses runs of non-alphanumeric separators without producing empty tokens', () => {
    expect(buildMatchQuery('parcial, de Bases-Datos!!')).toBe('"parcial" OR "de" OR "Bases" OR "Datos"')
  })

  it('keeps Spanish accented letters and ñ as part of a token instead of splitting on them', () => {
    expect(buildMatchQuery('¿Cuándo es el examen de programación?')).toBe(
      '"Cuándo" OR "es" OR "el" OR "examen" OR "de" OR "programación"'
    )
  })

  it('quotes FTS5 operator-like tokens so they are matched literally, not interpreted as MATCH operators (injection-safe)', () => {
    expect(buildMatchQuery('AND OR NOT')).toBe('"AND" OR "OR" OR "NOT"')
  })

  it('returns null for a question with no alphanumeric tokens (e.g. only punctuation/whitespace)', () => {
    expect(buildMatchQuery('???  ---')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(buildMatchQuery('')).toBeNull()
  })
})
