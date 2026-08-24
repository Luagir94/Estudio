// Installs a GLOBAL Zod error map so issues Zod raises WITHOUT an explicit
// message (Zod's own built-in defaults — e.g. `z.number().int().min(0)` in
// shared/ipc/materias.ts's scheduleSlotInputSchema) also render in Spanish,
// matching every schema check that DOES pass an explicit message (those
// already emit a stable i18next key from the `validation` namespace — see
// that architecture note in shared/ipc/*).
//
// `z.config({ customError })` is the current (v4) registration call — confirmed
// against node_modules/zod/v4/core/core.d.ts's `$ZodConfig`/`config()` and
// node_modules/zod/v4/classic/compat.d.ts, which marks `z.setErrorMap` as
// "@deprecated Use `z.config(params)` instead."
//
// Renderer-only, deliberately: shared/ipc stays framework-free (it is
// imported by main too), so this file lives here, imported once by
// `renderer/i18n/index.ts` at startup — it must never be imported from
// shared/ipc or main.
import { z } from 'zod'
import i18next from 'i18next'

export function installZodErrorMap(): void {
  z.config({
    customError: (issue) => {
      switch (issue.code) {
        case 'invalid_type':
          return i18next.t('validation:generic.invalidType')
        case 'too_small':
          return i18next.t('validation:generic.tooSmall')
        case 'too_big':
          return i18next.t('validation:generic.tooBig')
        case 'invalid_format':
          return i18next.t('validation:generic.invalidFormat')
        case 'invalid_value':
          return i18next.t('validation:generic.invalidValue')
        default:
          return i18next.t('validation:generic.fallback')
      }
    }
  })
}
