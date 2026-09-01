// PR3 (launch-route-restore), design D7: main validates the persisted launch
// route SYNTACTICALLY only. Semantic validation (does the route/entity still
// exist) stays in the router's own guards (`NotFoundRedirect`, `beforeLoad`),
// so main never learns a route name and never duplicates the route tree.
//
// Threat matrix: the persisted hash is untrusted input by the time it comes
// back — it round-trips through a settings row a hand-edited profile, an
// older build, or a corrupted write could leave malformed. A leading `//`
// is refused on top of the character class because a protocol-relative
// value could otherwise be handed to `loadFile`/`loadURL` as a navigation
// target rather than a plain in-document hash.
const LAUNCH_ROUTE_PATTERN = /^\/[A-Za-z0-9/?=&%._~-]{0,511}$/

/**
 * Returns `raw` unchanged when it is a syntactically valid launch route
 * (single leading slash, no `//` prefix, allowed character set, at most 512
 * characters total), otherwise `null`.
 */
export function parseLaunchRoute(raw: string | null): string | null {
  if (raw === null) return null
  if (raw.startsWith('//')) return null
  return LAUNCH_ROUTE_PATTERN.test(raw) ? raw : null
}

/**
 * Extracts the fragment (without the leading `#`) from a `file://`/`http://`
 * document URL, or `null` when there is none/it is empty/the URL fails to
 * parse. The raw building block `lastRouteService.remember()` feeds through
 * `parseLaunchRoute` before ever reaching main-side storage.
 */
export function hashFromUrl(url: string): string | null {
  try {
    const hash = new URL(url).hash
    return hash.length > 1 ? hash.slice(1) : null
  } catch {
    return null
  }
}
