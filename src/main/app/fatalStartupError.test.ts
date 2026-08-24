import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFatalStartupErrorReporter } from './fatalStartupError'

describe('createFatalStartupErrorReporter', () => {
  const logError = vi.fn()
  const showErrorBox = vi.fn()
  const quit = vi.fn()

  beforeEach(() => {
    logError.mockClear()
    showErrorBox.mockClear()
    quit.mockClear()
  })

  it('logs the error, shows a Spanish error dialog with the detail, and quits', () => {
    const report = createFatalStartupErrorReporter({ logError, showErrorBox, quit })

    report(new Error('SQLITE_CORRUPT: database disk image is malformed'))

    expect(logError).toHaveBeenCalledTimes(1)
    expect(showErrorBox).toHaveBeenCalledTimes(1)
    const [title, content] = showErrorBox.mock.calls[0] as [string, string]
    expect(title).toBe('No se pudo iniciar la aplicación')
    expect(content).toContain('SQLITE_CORRUPT: database disk image is malformed')
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('logs every failure but shows the dialog and quits only once', () => {
    const report = createFatalStartupErrorReporter({ logError, showErrorBox, quit })

    report(new Error('first failure'))
    report(new Error('second failure'))

    expect(logError).toHaveBeenCalledTimes(2)
    expect(showErrorBox).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('stringifies a non-Error rejection reason into the dialog body', () => {
    const report = createFatalStartupErrorReporter({ logError, showErrorBox, quit })

    report('plain string rejection')

    const [, content] = showErrorBox.mock.calls[0] as [string, string]
    expect(content).toContain('plain string rejection')
  })
})
