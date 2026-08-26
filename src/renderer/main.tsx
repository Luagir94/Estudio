// Side-effect import first: i18next must be initialized before any module in
// App's graph can call t() at module scope.
import i18next from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyStoredPalette } from './shared/lib/applyPalette'
import './shared/styles/globals.css'

// Keeps `index.html`'s static `<html lang="es">` truthful once a language
// switcher exists: set it on init, and again on every `languageChanged`
// (i18next's own event for `changeLanguage()` calls) so screen readers and
// hyphenation always match what is on screen.
document.documentElement.lang = i18next.language
i18next.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element not found')
}

// The palette is put on `<html>` BEFORE the first render, not in an effect
// inside it. The light/dark half of theming already opens correct — the main
// process applies `nativeTheme.themeSource` before the window exists — and an
// effect would give the palette worse odds than that: one painted frame in the
// default palette on the way to the one the student chose. A single awaited
// settings read costs a round trip nobody can see instead.
//
// It resolves either way (`applyStoredPalette` degrades rather than rejects),
// so there is no branch here where the app fails to mount.
async function boot(root: HTMLElement): Promise<void> {
  await applyStoredPalette()

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

// Passed in rather than closed over: the null check above narrows `container`
// for this scope, and that narrowing does not survive into a deferred closure.
void boot(container)
