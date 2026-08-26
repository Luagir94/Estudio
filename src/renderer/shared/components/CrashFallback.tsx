// The window's last readable state when a render throws.
//
// It is a component of its own because the app has TWO boundaries that must
// produce the identical screen: `ErrorBoundary` at the root of the tree, and
// the router's `defaultErrorComponent`, which catches a throw inside a routed
// screen before it can ever reach the root. A user who sees one of them must
// not be able to tell which one caught it.
//
// Translated through the singleton `i18n` rather than `useTranslation`,
// because `ErrorBoundary` is a class component (error boundaries are the one
// React feature with no hook equivalent) and cannot call a hook. Safe: i18n
// init is synchronous and the app is es-only, so there is no language change
// to re-render for.
import i18n from '../../i18n'

export function CrashFallback(): React.JSX.Element {
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
