// Maps a main-process `ipcErr(code, message)` CODE to app-owned Spanish
// copy (i18n phase 2 — "error banners must not render raw process text").
// `message` is a technical detail (an English SQLite message, the literal
// `'Unknown error'` fallback, or — since the Zod validation-map work landed
// — a raw machine key like `name.required`) and is NEVER fit for display;
// the CODE is the only thing about an IPC failure the app may show.
//
// The list below is every distinct code found across `ipcErr(...)` call
// sites in `src/main` (grepped 2026-08-23) — including the two attachment
// service codes (`ATTACHMENT_NOT_FOUND`, `NOT_MARKDOWN`, `FILE_TOO_LARGE`)
// that reach the bridge via `ipcErr(result.code, result.message)` rather
// than a literal string. `EXECUTION_FAILED` and the `ask:*` NOT_FOUND path
// are also included for completeness even though the ask panel already
// owns its own copy (`ask/domain/askDisplay.ts`) — this map is not consulted
// there, so there is no duplicate source of truth for those banners.
//
// An UNKNOWN code — main shipped ahead of the renderer, or a code this map
// has not been taught yet — falls back to the generic message. It must
// NEVER fall back to the raw message or to the code string itself: both are
// exactly the leak this map exists to close.
import i18n from '../../i18n'

const COPY = {
  VALIDATION_ERROR: i18n.t('errors:codes.VALIDATION_ERROR'),
  NOT_FOUND: i18n.t('errors:codes.NOT_FOUND'),
  CREATE_FAILED: i18n.t('errors:codes.CREATE_FAILED'),
  LIST_FAILED: i18n.t('errors:codes.LIST_FAILED'),
  DETAIL_FAILED: i18n.t('errors:codes.DETAIL_FAILED'),
  UPDATE_FAILED: i18n.t('errors:codes.UPDATE_FAILED'),
  DELETE_FAILED: i18n.t('errors:codes.DELETE_FAILED'),
  OUTCOME_FAILED: i18n.t('errors:codes.OUTCOME_FAILED'),
  ADD_FAILED: i18n.t('errors:codes.ADD_FAILED'),
  OPEN_FAILED: i18n.t('errors:codes.OPEN_FAILED'),
  ATTACHMENT_FILE_MISSING: i18n.t('errors:codes.ATTACHMENT_FILE_MISSING'),
  READ_FAILED: i18n.t('errors:codes.READ_FAILED'),
  WRITE_FAILED: i18n.t('errors:codes.WRITE_FAILED'),
  DASHBOARD_FAILED: i18n.t('errors:codes.DASHBOARD_FAILED'),
  URL_REFUSED: i18n.t('errors:codes.URL_REFUSED'),
  EXPORT_FAILED: i18n.t('errors:codes.EXPORT_FAILED'),
  WEEK_FAILED: i18n.t('errors:codes.WEEK_FAILED'),
  PROBE_FAILED: i18n.t('errors:codes.PROBE_FAILED'),
  PREFERENCES_READ_FAILED: i18n.t('errors:codes.PREFERENCES_READ_FAILED'),
  DISCONNECT_FAILED: i18n.t('errors:codes.DISCONNECT_FAILED'),
  SET_OVERRIDE_FAILED: i18n.t('errors:codes.SET_OVERRIDE_FAILED'),
  CREATE_PERIOD_FAILED: i18n.t('errors:codes.CREATE_PERIOD_FAILED'),
  UPDATE_PERIOD_FAILED: i18n.t('errors:codes.UPDATE_PERIOD_FAILED'),
  DELETE_PERIOD_FAILED: i18n.t('errors:codes.DELETE_PERIOD_FAILED'),
  SETDONE_FAILED: i18n.t('errors:codes.SETDONE_FAILED'),
  SYNC_FAILED: i18n.t('errors:codes.SYNC_FAILED'),
  EXECUTION_FAILED: i18n.t('errors:codes.EXECUTION_FAILED'),
  ATTACHMENT_NOT_FOUND: i18n.t('errors:codes.ATTACHMENT_NOT_FOUND'),
  NOT_MARKDOWN: i18n.t('errors:codes.NOT_MARKDOWN'),
  FILE_TOO_LARGE: i18n.t('errors:codes.FILE_TOO_LARGE')
} as const satisfies Record<string, string>

export type KnownIpcErrorCode = keyof typeof COPY

function isKnownIpcErrorCode(code: string): code is KnownIpcErrorCode {
  return Object.prototype.hasOwnProperty.call(COPY, code)
}

/** The one string an unrecognized (or absent) code may ever resolve to. */
export const GENERIC_IPC_ERROR_MESSAGE = i18n.t('errors:generic')

/** Maps a raw code string to app-owned copy. Never throws on an unknown code — falls back to the generic message. */
export function describeIpcErrorCode(code: string | undefined | null): string {
  if (code !== undefined && code !== null && isKnownIpcErrorCode(code)) {
    return COPY[code]
  }
  return GENERIC_IPC_ERROR_MESSAGE
}

/**
 * Duck-types the `code: string` shape every adapter's own `XxxApiError`
 * carries (`AdjuntosApiError`, `AjustesApiError`, `AskApiError`, and any
 * domain adapter that follows the same pattern) rather than importing each
 * class here — this module stays a leaf every adapter can depend on without
 * ever depending on one back.
 */
function hasErrorCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

/**
 * Convenience for a `useMutation`/`useQuery` `error` field: `undefined` while
 * there is no error, otherwise the mapped copy for whatever code the thrown
 * error carries (or the generic message, for a plain `Error` with no code —
 * a Zod response-parse failure, say, which is an app bug, not a reportable
 * IPC outcome).
 */
export function describeIpcError(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined
  }
  return describeIpcErrorCode(hasErrorCode(error) ? error.code : undefined)
}
