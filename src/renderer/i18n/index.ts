// Single shared i18next instance for app AND tests. `initAsync: false` (the
// v23+ rename of `initImmediate`) with fully bundled resources makes init
// synchronous, so `t()` is usable the moment this module is imported — no
// provider, no suspense, no async gate.
// That is what lets vitest.setup.ts import this same module and have every
// component test render translated strings with zero per-test setup.
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import adjuntos from '../locales/es/adjuntos.json'
import ajustes from '../locales/es/ajustes.json'
import ask from '../locales/es/ask.json'
import carreras from '../locales/es/carreras.json'
import common from '../locales/es/common.json'
import entregas from '../locales/es/entregas.json'
import errors from '../locales/es/errors.json'
import fechas from '../locales/es/fechas.json'
import finales from '../locales/es/finales.json'
import horario from '../locales/es/horario.json'
import hoy from '../locales/es/hoy.json'
import materias from '../locales/es/materias.json'
import parciales from '../locales/es/parciales.json'
import validation from '../locales/es/validation.json'
import { installZodErrorMap } from './zodErrorMap'

void i18next.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  ns: [
    'common',
    'hoy',
    'horario',
    'materias',
    'carreras',
    'entregas',
    'fechas',
    'finales',
    'parciales',
    'adjuntos',
    'ask',
    'ajustes',
    'validation',
    'errors'
  ],
  resources: {
    es: {
      common,
      hoy,
      horario,
      materias,
      carreras,
      entregas,
      fechas,
      finales,
      parciales,
      adjuntos,
      ask,
      ajustes,
      validation,
      errors
    }
  },
  // React already escapes interpolated output; escaping here would corrupt
  // user data (subject names, colors) with HTML entities.
  interpolation: { escapeValue: false },
  initAsync: false
})

// Installed HERE, once, at renderer startup — not in shared/ipc (which stays
// framework-free) and not per-schema. `initAsync: false` above means i18next
// is already usable synchronously by the time this runs, so the map's own
// i18next.t() calls (see zodErrorMap.ts) always resolve real copy, never a
// pre-init fallback.
installZodErrorMap()

// The `<html lang>` sync (see `main.tsx`) deliberately does NOT live here:
// `tsconfig.node.json` pulls this whole directory into the NODE program too
// (composite-project requirement — `vitest.setup.ts` imports this module for
// every test, including ones under Vitest's DOM-less default 'node'
// environment), so this file's lib has no `document` type at all. `main.tsx`
// is web-only and already touches the DOM, so that is where it belongs.
export default i18next
