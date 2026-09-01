import { describe, expect, it } from 'vitest'
import { hashFromUrl, parseLaunchRoute } from './launchRoute'

// PR3 (launch-route-restore), design D7: main validates the stored hash
// SYNTACTICALLY only — semantic validation (does the route/entity still
// exist) stays in the router's existing guards, so main never learns a
// route name. Threat matrix: the persisted hash is untrusted input (it
// round-trips through a settings row a hand-edited profile could corrupt).
describe('parseLaunchRoute', () => {
  it('accepts a valid route hash', () => {
    expect(parseLaunchRoute('/carreras/3?tab=plan')).toBe('/carreras/3?tab=plan')
  })

  it('accepts the shortest valid route (just a leading slash)', () => {
    expect(parseLaunchRoute('/')).toBe('/')
  })

  it('rejects null (nothing persisted yet)', () => {
    expect(parseLaunchRoute(null)).toBeNull()
  })

  it('rejects a protocol-relative // prefix', () => {
    expect(parseLaunchRoute('//evil')).toBeNull()
  })

  it('rejects a value with no leading slash', () => {
    expect(parseLaunchRoute('carreras/3')).toBeNull()
  })

  it('rejects control characters', () => {
    expect(parseLaunchRoute('/carreras/3\u0000')).toBeNull()
  })

  it('rejects a value longer than 512 characters', () => {
    expect(parseLaunchRoute(`/${'a'.repeat(512)}`)).toBeNull()
  })

  it('accepts a value at exactly the 512 character boundary', () => {
    expect(parseLaunchRoute(`/${'a'.repeat(511)}`)).toBe(`/${'a'.repeat(511)}`)
  })

  it('rejects an empty string', () => {
    expect(parseLaunchRoute('')).toBeNull()
  })
})

describe('hashFromUrl', () => {
  it('extracts the hash from a file:// URL', () => {
    expect(hashFromUrl('file:///C:/app/index.html#/carreras/3?tab=plan')).toBe('/carreras/3?tab=plan')
  })

  it('extracts the hash from an http:// URL', () => {
    expect(hashFromUrl('http://localhost:5173/#/hoy')).toBe('/hoy')
  })

  it('returns null when there is no hash', () => {
    expect(hashFromUrl('file:///C:/app/index.html')).toBeNull()
  })

  it('returns null for an empty hash', () => {
    expect(hashFromUrl('file:///C:/app/index.html#')).toBeNull()
  })

  it('returns null for an unparseable URL', () => {
    expect(hashFromUrl('not a url')).toBeNull()
  })
})
