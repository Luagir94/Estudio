import mainI18n from '../i18n'

export interface FatalStartupErrorDeps {
  logError: (message: string, error: unknown) => void
  showErrorBox: (title: string, content: string) => void
  quit: () => void
}

export type FatalStartupErrorReporter = (error: unknown) => void

/**
 * Builds the single fatal-error exit path for the main process: log, show
 * one native error dialog, quit. Every entry point (`bootstrap().catch`,
 * `unhandledRejection`, `uncaughtException`) routes through the SAME
 * returned function, and the `reported` latch is what keeps a cascade of
 * failures from stacking dialogs — later errors are still logged, but only
 * the first one is shown and triggers the quit.
 *
 * Electron-free on purpose (same convention as `exportMenu.ts`): the caller
 * injects `dialog.showErrorBox` — safe before app `ready`, which matters
 * because the process-level handlers are registered before it — and
 * `app.quit`.
 */
export function createFatalStartupErrorReporter(deps: FatalStartupErrorDeps): FatalStartupErrorReporter {
  let reported = false

  return (error) => {
    deps.logError('Fatal startup error', error)
    if (reported) {
      return
    }
    reported = true

    const detail = error instanceof Error ? error.message : String(error)
    deps.showErrorBox(mainI18n.t('fatalStartupError.title'), mainI18n.t('fatalStartupError.body', { detail }))
    deps.quit()
  }
}
