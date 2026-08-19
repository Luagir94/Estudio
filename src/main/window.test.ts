import { beforeEach, describe, expect, it, vi } from 'vitest'

const { BrowserWindowMock, sessionMock } = vi.hoisted(() => {
  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = []
    options: Record<string, unknown>
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getURL: vi.fn(() => 'file:///C:/app/renderer/index.html')
    }

    constructor(options: Record<string, unknown>) {
      this.options = options
      BrowserWindowMock.instances.push(this)
    }
  }

  const sessionMock = {
    defaultSession: {
      webRequest: { onHeadersReceived: vi.fn() }
    }
  }

  return { BrowserWindowMock, sessionMock }
})

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  session: sessionMock
}))

import {
  applyContentSecurityPolicy,
  CONTENT_SECURITY_POLICY,
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
  createMainWindow,
  isBlockedNavigation
} from './window'

describe('window hardening', () => {
  beforeEach(() => {
    BrowserWindowMock.instances = []
    sessionMock.defaultSession.webRequest.onHeadersReceived.mockClear()
  })

  it('creates the BrowserWindow with contextIsolation, no nodeIntegration, and sandbox enabled', () => {
    const win = createMainWindow() as unknown as InstanceType<typeof BrowserWindowMock>

    expect(win.options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
  })

  // The renderer is responsive down to a floor, not to zero: past this the
  // layout only degrades into scrollbars, so the window itself refuses to
  // shrink further (same idea as any desktop app's minimum size).
  it('refuses to be resized below the layout floor', () => {
    const win = createMainWindow() as unknown as InstanceType<typeof BrowserWindowMock>

    expect(win.options).toMatchObject({ minWidth: 640, minHeight: 560 })
  })

  it('denies every window-open request via setWindowOpenHandler', () => {
    const win = createMainWindow() as unknown as InstanceType<typeof BrowserWindowMock>
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0] as (details: { url: string }) => {
      action: string
    }

    expect(handler({ url: 'https://evil.example.com' })).toEqual({ action: 'deny' })
    expect(handler({ url: 'about:blank' })).toEqual({ action: 'deny' })
  })

  it('prevents the main frame from navigating away via will-navigate', () => {
    const win = createMainWindow() as unknown as InstanceType<typeof BrowserWindowMock>
    const registration = win.webContents.on.mock.calls.find(([eventName]) => eventName === 'will-navigate')
    expect(registration).toBeDefined()
    const handler = registration![1] as (event: { preventDefault: () => void }, url: string) => void

    // getURL() is mocked to the loaded file:// document — a remote origin is blocked.
    const remote = { preventDefault: vi.fn() }
    handler(remote, 'https://evil.example.com')
    expect(remote.preventDefault).toHaveBeenCalledTimes(1)

    // A navigation back to the exact loaded document is allowed through.
    const same = { preventDefault: vi.fn() }
    handler(same, 'file:///C:/app/renderer/index.html')
    expect(same.preventDefault).not.toHaveBeenCalled()
  })

  it('registers the renderer CSP header on every response', () => {
    applyContentSecurityPolicy(sessionMock.defaultSession as never)

    const handler = sessionMock.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0] as (
      details: { responseHeaders: Record<string, string[]> },
      callback: (response: { responseHeaders: Record<string, string[]> }) => void
    ) => void
    const callback = vi.fn()

    handler({ responseHeaders: {} }, callback)

    const response = callback.mock.calls[0][0] as { responseHeaders: Record<string, string[]> }
    expect(response.responseHeaders['Content-Security-Policy']).toEqual([CONTENT_SECURITY_POLICY])
  })

  it('matches the exact policy from design §7', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    )
  })
})

/*
 * Regression guard. The strict production policy blocked the inline React
 * Refresh preamble that `@vitejs/plugin-react` injects in dev, so the
 * renderer never mounted under `npm run dev` — a blank white window — while
 * the packaged build worked correctly. Dev needs `'unsafe-inline'` for
 * scripts; the SHIPPED app must never get it.
 */
describe('CSP development relaxation', () => {
  beforeEach(() => {
    BrowserWindowMock.instances = []
    sessionMock.defaultSession.webRequest.onHeadersReceived.mockClear()
  })

  function registeredPolicy(): string {
    const handler = sessionMock.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0] as (
      details: { responseHeaders: Record<string, string[]> },
      callback: (response: { responseHeaders: Record<string, string[]> }) => void
    ) => void
    const callback = vi.fn()

    handler({ responseHeaders: {} }, callback)

    const response = callback.mock.calls[0][0] as { responseHeaders: Record<string, string[]> }
    return response.responseHeaders['Content-Security-Policy'][0]
  }

  it('never allows inline scripts in the production policy', () => {
    const scriptSrc = CONTENT_SECURITY_POLICY.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'))

    expect(scriptSrc).toBe("script-src 'self'")
    expect(scriptSrc).not.toContain('unsafe-inline')
  })

  it('allows inline scripts in the development policy so the react preamble runs', () => {
    const scriptSrc = DEVELOPMENT_CONTENT_SECURITY_POLICY.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'))

    expect(scriptSrc).toContain("'unsafe-inline'")
  })

  it('serves the strict policy when not in development', () => {
    applyContentSecurityPolicy(sessionMock.defaultSession as never, { isDevelopment: false })

    expect(registeredPolicy()).toBe(CONTENT_SECURITY_POLICY)
  })

  it('serves the relaxed policy only when in development', () => {
    applyContentSecurityPolicy(sessionMock.defaultSession as never, { isDevelopment: true })

    expect(registeredPolicy()).toBe(DEVELOPMENT_CONTENT_SECURITY_POLICY)
  })

  it('defaults to the strict policy when no mode is given', () => {
    applyContentSecurityPolicy(sessionMock.defaultSession as never)

    expect(registeredPolicy()).toBe(CONTENT_SECURITY_POLICY)
  })
})

/*
 * Navigation lock. The preload re-attaches `window.api` on every navigation,
 * so the main frame must never reach a document other than the one it
 * loaded — otherwise a remote origin would inherit the whole IPC surface.
 */
describe('isBlockedNavigation', () => {
  const APP_DOC = 'file:///C:/app/renderer/index.html'
  const DEV_DOC = 'http://localhost:5173/index.html'

  it('allows navigation back to the exact document already loaded', () => {
    expect(isBlockedNavigation(APP_DOC, APP_DOC)).toBe(false)
    expect(isBlockedNavigation(DEV_DOC, DEV_DOC)).toBe(false)
  })

  it('allows a query-string change on the same document', () => {
    expect(isBlockedNavigation(APP_DOC, `${APP_DOC}?tab=hoy`)).toBe(false)
  })

  it('blocks navigation to a remote origin', () => {
    expect(isBlockedNavigation(APP_DOC, 'https://evil.example.com')).toBe(true)
    expect(isBlockedNavigation(DEV_DOC, 'https://evil.example.com/index.html')).toBe(true)
  })

  it('blocks a jump to a different local file (file:// origins all read as "null")', () => {
    expect(isBlockedNavigation(APP_DOC, 'file:///C:/Windows/System32/x.html')).toBe(true)
  })

  it('blocks a different path on the same dev origin', () => {
    expect(isBlockedNavigation(DEV_DOC, 'http://localhost:5173/evil.html')).toBe(true)
  })

  it('blocks unparseable navigation targets', () => {
    expect(isBlockedNavigation(APP_DOC, 'not a url')).toBe(true)
  })
})
