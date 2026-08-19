import path from 'node:path'
import { BrowserWindow, session } from 'electron'

// Baseline hardening (design §7). This must exist before the first window
// ever opens — moved into slice 1 deliberately, see delivery decision
// "Security-ordering defect" (sdd/course-companion/delivery).
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"

/**
 * Development-only policy. `@vitejs/plugin-react` injects the React Refresh
 * preamble as an INLINE script into the dev server's HTML; the production
 * `script-src 'self'` blocks it, the plugin then throws "can't detect
 * preamble", React never mounts, and `npm run dev` shows a blank window
 * while the packaged build works fine.
 *
 * This relaxation applies ONLY when the renderer is served by the Vite dev
 * server. The shipped app always gets CONTENT_SECURITY_POLICY.
 */
export const DEVELOPMENT_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"

interface ContentSecurityPolicyOptions {
  /** True only when the renderer is served by the Vite dev server. */
  isDevelopment?: boolean
}

/**
 * Registers the renderer Content-Security-Policy header on the given
 * Electron session. Applied once, before any window loads content.
 *
 * Defaults to the STRICT policy: an unknown or unspecified mode must never
 * silently ship the relaxed one.
 */
export function applyContentSecurityPolicy(
  targetSession: Electron.Session = session.defaultSession,
  { isDevelopment = false }: ContentSecurityPolicyOptions = {}
): void {
  const policy = isDevelopment ? DEVELOPMENT_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

/**
 * True when a full-document navigation of the main frame must be blocked:
 * anything that is not the exact document already loaded. Same origin AND
 * same path are both required — so a remote origin (`https://…`) is refused,
 * and so is a jump to a different local file (every `file://` URL reports its
 * origin as the string `"null"`, so origin alone cannot tell two local files
 * apart; the path check is what does). Unparseable input is refused too.
 *
 * SPA route changes use the history API, which fires `did-navigate-in-page`
 * rather than `will-navigate`, so this never interferes with in-app routing.
 */
export function isBlockedNavigation(currentUrl: string, targetUrl: string): boolean {
  let current: URL
  let target: URL
  try {
    current = new URL(currentUrl)
    target = new URL(targetUrl)
  } catch {
    return true
  }
  return target.origin !== current.origin || target.pathname !== current.pathname
}

/**
 * Creates the app's single BrowserWindow with the required security
 * baseline: context isolation, no Node integration, sandboxed renderer,
 * a deny-all `setWindowOpenHandler` (no new windows/tabs are ever allowed
 * to spawn from renderer content), and a `will-navigate` guard that keeps
 * the main frame on the document it loaded.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    // The renderer is responsive down to a point, not to zero: below this the
    // sidebar rail plus one readable content column no longer fit, and the
    // layout would only degrade into scrollbars. Stopping the resize is
    // cheaper and more honest than shipping a size nothing renders well at.
    minWidth: 640,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // `setWindowOpenHandler` stops new windows, but NOT a full-page navigation
  // of THIS frame (a `location =` assignment, or a link to a new document).
  // The preload re-attaches `window.api` on every navigation, so letting the
  // frame reach a remote origin would hand that origin the entire IPC
  // surface. Locking navigation to the loaded document is the safety net that
  // keeps a future link or injected navigation from ever crossing that line.
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (isBlockedNavigation(window.webContents.getURL(), targetUrl)) {
      event.preventDefault()
    }
  })

  return window
}
