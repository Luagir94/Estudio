// shared/ipc schemas are framework-free (imported by main AND renderer — see
// the architecture note at the top of shared/ipc/materias.ts) and so emit
// STABLE MACHINE KEYS as their zod issue `message` (e.g. `name.required`),
// never prose. This is the one place a form's `errors.<field>.message`
// becomes user-facing copy.
//
// A message that is NOT one of our keys — a Zod built-in default already
// localized by the global error map (renderer/i18n/zodErrorMap.ts), or any
// other raw string — must render UNCHANGED, not as a literal key. i18next's
// `defaultValue` does exactly this: when the key has no match in the
// `validation` namespace, `t()` returns `defaultValue` verbatim instead of
// the key itself (verified directly against the installed i18next package —
// see the phase-2 i18n validation-namespace change notes).
import type { TFunction } from 'i18next'

export function translateValidationMessage(t: TFunction, message: string | undefined): string | undefined {
  if (message === undefined) {
    return undefined
  }
  return t(message, { ns: 'validation', defaultValue: message })
}
