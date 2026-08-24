// Side-effect import first: i18next must be initialized before any module in
// App's graph can call t() at module scope.
import i18next from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
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

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
