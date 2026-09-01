import { describe, expect, it } from 'vitest'
import { ROUTE_BY_DOMAIN, domainFromPathname, parseRouteId } from './navigation'

describe('parseRouteId', () => {
  it('reads a positive integer id out of its raw path segment', () => {
    expect(parseRouteId('42')).toBe(42)
  })

  // Every one of these used to be able to reach a container as `NaN` and from
  // there an IPC call, because the old navigation carried real numbers in
  // component state and a path segment is only ever a string.
  it.each(['', 'abc', '0', '-1', '1.5', '1e3', ' 42', '42 ', '07', 'NaN', 'Infinity', '9007199254740993'])(
    'refuses %o rather than handing a container a broken id',
    (raw) => {
      expect(parseRouteId(raw)).toBeNull()
    }
  )
})

describe('domainFromPathname', () => {
  it('maps the root path to hoy, the launch screen', () => {
    expect(domainFromPathname('/')).toBe('hoy')
  })

  it.each([
    ['/hoy', 'hoy'],
    ['/materias', 'materias'],
    ['/horario', 'horario'],
    ['/entregas', 'entregas'],
    ['/carreras', 'carreras'],
    ['/ajustes', 'ajustes']
  ] as const)('maps %s to the %s domain', (pathname, domain) => {
    expect(domainFromPathname(pathname)).toBe(domain)
  })

  // The sidebar must stay lit on the domain you are inside, not only on its
  // index screen: opening a subject is still "you are in Materias".
  it.each([
    ['/materias/42', 'materias'],
    ['/carreras/3', 'carreras'],
    ['/carreras/3/periodos/9', 'carreras']
  ] as const)('keeps %s highlighted as %s', (pathname, domain) => {
    expect(domainFromPathname(pathname)).toBe(domain)
  })

  // A pathname nothing in the nav owns must not leave the sidebar with no
  // active item at all — an unlit nav reads as a broken app.
  it('falls back to hoy for a pathname no nav item owns', () => {
    expect(domainFromPathname('/no-such-screen')).toBe('hoy')
  })

  it('tolerates a trailing slash', () => {
    expect(domainFromPathname('/materias/')).toBe('materias')
  })
})

describe('ROUTE_BY_DOMAIN', () => {
  it('gives every sidebar domain a destination path', () => {
    expect(ROUTE_BY_DOMAIN).toEqual({
      hoy: '/hoy',
      materias: '/materias',
      horario: '/horario',
      entregas: '/entregas',
      carreras: '/carreras',
      ajustes: '/ajustes'
    })
  })

  // Round-trips the two halves against each other: a destination the sidebar
  // can reach but that reads back as a different domain would light the wrong
  // nav item the moment you arrived.
  it('round-trips every destination back to its own domain', () => {
    for (const [domain, path] of Object.entries(ROUTE_BY_DOMAIN)) {
      expect(domainFromPathname(path)).toBe(domain)
    }
  })
})
