import { describe, expect, it } from 'vitest'
import { CARRERA_TABS, isCarreraTab } from './carreraTab'

describe('isCarreraTab', () => {
  it.each(CARRERA_TABS)('accepts %s', (tab) => {
    expect(isCarreraTab(tab)).toBe(true)
  })

  it('rejects an unrecognised value', () => {
    expect(isCarreraTab('inventado')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isCarreraTab(undefined)).toBe(false)
  })
})
