// Root render-crash guard. Without it, a throw during render unmounts the
// whole React tree and the Electron window goes blank — no menu bar rescue,
// no error text, nothing. The fallback keeps the window alive with copy the
// user can act on.
//
// A CLASS component on purpose: error boundaries are the one React feature
// with no hook equivalent (`getDerivedStateFromError` only exists on
// classes), which also means no `useTranslation` — the singleton `i18n`
// instance is consulted directly instead, same precedent as
// `shared/lib/ipcErrorCopy.ts`. Safe because i18n init is synchronous and
// the app is es-only, so there is no language change to re-render for.
//
// The caught error is deliberately NOT logged: the renderer has no logging
// path (repo hygiene bans console.* in source, and the preload bridge
// exposes no log channel). React's dev overlay still reports it during
// development.
import { Component, type ReactNode } from 'react'
import i18n from '../../i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex h-screen w-full flex-col items-center justify-center gap-2 bg-background px-6 text-center"
        >
          <h1 className="font-display text-heading font-bold text-foreground">{i18n.t('errors:boundary.title')}</h1>
          <p className="text-body-lg text-destructive">{i18n.t('errors:boundary.body')}</p>
        </div>
      )
    }

    return this.props.children
  }
}
