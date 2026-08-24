import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { translateValidationMessage } from './translateValidationMessage'

// Runs against the REAL i18next instance (bootstrapped by vitest.setup.ts,
// same instance every component under test uses) rather than a stub — the
// whole point of this helper is a specific i18next behavior (`defaultValue`
// falling back to the raw string for an unknown key), so a mock would prove
// nothing.
describe('translateValidationMessage', () => {
  it('translates one of our stable schema keys into its Spanish copy', () => {
    expect(translateValidationMessage(i18n.t, 'name.required')).toBe('Poné un nombre')
  })

  it('translates a nested key from a different field', () => {
    expect(translateValidationMessage(i18n.t, 'gradeScale.mustBeAbsent')).toBe(
      'Un programa binario no puede tener escala de notas'
    )
  })

  it('renders a message that is NOT one of our keys unchanged, not as a literal key', () => {
    // Stands in for a Zod built-in default already localized by the global
    // error map (renderer/i18n/zodErrorMap.ts) — some arbitrary Spanish
    // sentence with no entry under the `validation` namespace.
    const alreadyLocalized = 'Ese valor no es válido'
    expect(translateValidationMessage(i18n.t, alreadyLocalized)).toBe(alreadyLocalized)
  })

  it('renders an unknown raw string containing "." and ":" unchanged (no accidental key/ns parsing)', () => {
    const raw = 'Error: revisá este campo. Falta un valor'
    expect(translateValidationMessage(i18n.t, raw)).toBe(raw)
  })

  it('returns undefined when there is no message to translate', () => {
    expect(translateValidationMessage(i18n.t, undefined)).toBeUndefined()
  })
})
