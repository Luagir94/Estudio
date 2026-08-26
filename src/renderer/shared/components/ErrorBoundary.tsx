// Root render-crash guard. Without it, a throw during render unmounts the
// whole React tree and the Electron window goes blank — no menu bar rescue,
// no error text, nothing. The fallback keeps the window alive with copy the
// user can act on.
//
// A CLASS component on purpose: error boundaries are the one React feature
// with no hook equivalent (`getDerivedStateFromError` only exists on
// classes).
//
// It is no longer the only boundary in the app. The router installs its own
// around each routed screen, so a throw inside a screen is caught THERE and
// never reaches this one; this boundary now covers what sits above the
// router — the providers, the router itself, and the Shell. Both render the
// same `CrashFallback`, so which one caught it is invisible to the user.
//
// The caught error is deliberately NOT logged: the renderer has no logging
// path (repo hygiene bans console.* in source, and the preload bridge
// exposes no log channel). React's dev overlay still reports it during
// development.
import { Component, type ReactNode } from 'react'
import { CrashFallback } from './CrashFallback'

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
      return <CrashFallback />
    }

    return this.props.children
  }
}
