// Independent i18next instance for the MAIN process (Node/Electron side).
//
// Deliberately a separate instance from `src/renderer/i18n` — main and
// renderer are two independent processes and must never import from one
// another (see `tooling/dependencyGuard.mts`'s trust-boundary rules and the
// tsconfig.node.json / tsconfig.web.json split). `createInstance()` is what
// keeps this instance's state from ever being shared with, or importing,
// the renderer's.
//
// Synchronous init with bundled resources, same convention as the renderer
// singleton (`initAsync: false`): `t()` is usable the moment this module is
// imported. No `initReactI18next` plugin — main never renders JSX.
import { createInstance, type i18n as I18nInstance } from 'i18next'
import main from '../locales/es/main.json'

// Explicit annotation: TS7's portability check cannot name `i18n`'s inferred
// return type without one (TS2883).
const mainI18n: I18nInstance = createInstance()

void mainI18n.init({
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'main',
  ns: ['main'],
  resources: { es: { main } },
  interpolation: { escapeValue: false },
  initAsync: false
})

// SEAM: this `lng` and the renderer's (`src/renderer/i18n`) are two
// independent pieces of state — nothing keeps them in sync today because
// both are hardcoded to `'es'`. That stops being harmless the moment a
// language switcher exists: calling `changeLanguage()` on the renderer
// singleton only changes what the UI renders. It does NOT reach this
// instance, so main-side `t()` calls — e.g. `promptBuilder.ts`'s
// `mainI18n.t('promptBuilder.languageInstruction')`, which tells the LLM
// what language to answer in — would keep producing the OLD language. A
// future switcher must change both instances (e.g. the renderer forwarding
// the new language to main over IPC, which calls `mainI18n.changeLanguage()`
// here), or the visible UI and the LLM's answers will disagree about
// language.
export default mainI18n
