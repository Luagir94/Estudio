// Pure, framework-free domain module (design D7/D9) — the mapping from a
// `CliProviderStatus` to what the settings screen shows. No electron/IPC
// import, same convention as `materias/domain/subjectStatus.ts`.
//
// Text is sourced from the `ajustes` i18next namespace via the shared
// singleton, same convention as `adjuntos/domain/attachmentDisplay.ts`: the
// singleton initializes synchronously (`initAsync: false`), so `i18n.t()` is
// safe to call at module-eval time as well as from inside these functions.
import type { CliProbeFailureReason, CliProvider, CliProviderStatus } from '../../../shared/ipc/cli'
import i18n from '../../i18n'

/**
 * Semantic chip color, decoupled from any Tailwind class name — the
 * presentational layer maps this to `border-{tone}`/`bg-{tone}-soft`/
 * `text-{tone}` (see `SubjectStatusBadge.tsx` for the established pattern).
 */
export type ConnectionTone = 'ok' | 'warn' | 'urgent'

/**
 * Chip color reflects failure severity, not mere presence of a state
 * (spec "Chip Color Reflects Failure Severity", design D7 — SETTLED, do not
 * reopen):
 * - `not-found` → `warn` (amber): the CLI simply isn't installed, a normal
 *   starting state, not an error.
 * - `unusable` → `urgent` (red): the user configured something believing it
 *   would work and it doesn't — the stronger signal.
 * - `connected` → `ok` (green): working as expected.
 */
const CONNECTION_TONES: Record<CliProviderStatus['status'], ConnectionTone> = {
  connected: 'ok',
  'not-found': 'warn',
  unusable: 'urgent'
}

export function resolveConnectionTone(status: CliProviderStatus['status']): ConnectionTone {
  return CONNECTION_TONES[status]
}

/** Display name for each supported CLI. */
export const PROVIDER_LABELS: Record<CliProvider, string> = {
  claude: i18n.t('ajustes:connectionDisplay.providerLabel.claude'),
  antigravity: i18n.t('ajustes:connectionDisplay.providerLabel.antigravity'),
  codex: i18n.t('ajustes:connectionDisplay.providerLabel.codex')
}

/**
 * What a card says about itself before its probe has answered.
 *
 * This is NOT a fourth value of `CliProviderStatus['status']` and must never
 * become one: that enum is the IPC contract for something the main process
 * OBSERVED. "Detecting" is the renderer's own account of not having heard back
 * yet, so it lives here and stops at the bridge.
 *
 * It exists because the screen has to spawn up to three processes before it
 * can say anything true, and rendering nothing in the meantime is indistinguishable
 * from a settings page that is broken or empty.
 */
export const DETECTING_LABEL = i18n.t('ajustes:connectionDisplay.detectingLabel')

/**
 * Starts the FIRST probe of a CLI; `RETRY_ACTION` re-runs one that already
 * answered.
 *
 * A row that has never been probed carries this button and NO status chip
 * (approved `.pen`, "Card — Antigravity CLI (sin conectar)"). The absence is
 * deliberate: a chip is how this screen reports something the main process
 * OBSERVED, and nothing was observed here, because nobody asked. "No lo
 * buscamos" and "lo buscamos y no está" are different facts, and a chip is the
 * one element on the row that cannot say the first without being mistaken for
 * the second.
 */
export const CONNECT_ACTION = i18n.t('ajustes:connectionDisplay.connectAction')
export const RETRY_ACTION = i18n.t('ajustes:connectionDisplay.retryAction')

/**
 * Withdraws the opt-in for one CLI, returning its row to idle.
 *
 * It exists because persistence without it would be a one-way door: a CLI
 * connected once would be re-probed on every launch forever, and this app's
 * whole promise is that it runs nothing the student did not ask for. A promise
 * you cannot take back is not a promise about the student's choice.
 *
 * The word is deliberately not 'Eliminar' or 'Borrar': nothing is deleted. The
 * manual path override survives, so reconnecting does not mean finding an
 * install location again.
 */
export const DISCONNECT_ACTION = i18n.t('ajustes:connectionDisplay.disconnectAction')

/**
 * Placeholder of the inline path field, exact per the approved `.pen` (node
 * "Path Placeholder").
 *
 * "(opcional)" is the load-bearing word: leaving it empty is the normal case
 * and means autodetection on the PATH. A student who reads this as a required
 * field would think they have to hunt down an install location before the
 * button does anything.
 */
export const PATH_INPUT_PLACEHOLDER = i18n.t('ajustes:connectionDisplay.pathInputPlaceholder')

/**
 * The command each card's probe actually runs, named in its own policy note.
 *
 * The EXECUTABLE, not the product: Antigravity's binary is `agy`, and a note
 * promising `antigravity --version` would describe a command the app never runs
 * — which is the one thing a policy note may not do.
 */
export const PROVIDER_COMMANDS: Record<CliProvider, string> = {
  claude: 'claude --version',
  antigravity: 'agy --version',
  codex: 'codex --version'
}

/**
 * Trust-boundary control (design D9), not decoration: the ONLY user-facing
 * compensating control for a boundary that admits no allowlist. Value is
 * exact per the approved `.pen` design (node `kLczV`, frame "Grupo —
 * Ajustes" › "Card — Ruta manual" › "Warning Note"), generalized from
 * "un ejecutable de Claude" to name whichever CLI the card belongs to —
 * pointing an Antigravity card at a Claude warning would be worse than no
 * warning.
 * Rendered UNCONDITIONALLY whenever the manual-path card renders — never
 * gated on status, override presence, or focus.
 */
export function executionWarningCopy(provider: CliProvider): string {
  return i18n.t('ajustes:connectionDisplay.executionWarning', { provider: PROVIDER_LABELS[provider] })
}

/**
 * Friendly Spanish message for the `unusable` state (spec "Unusable Detail
 * Copy"): shown alongside one localized reason line — see
 * `describeCliFailureReason` below, which is what supplies that second line
 * now that `CliProviderStatus.detail` is no longer rendered.
 *
 * Deliberately says nothing about WHERE the executable came from. `unusable`
 * covers both an override the user typed and a binary autodetected on PATH,
 * so wording like "el que configuraste" would send a user who never touched
 * the setting looking for a setting they never changed.
 */
export function unusableFriendlyMessage(provider: CliProvider): string {
  return i18n.t('ajustes:connectionDisplay.unusableFriendlyMessage', { provider: PROVIDER_LABELS[provider] })
}

/**
 * Localizes the structured reason behind an `unusable` status
 * (`CliProbeFailureReason`, `src/shared/ipc/cli.ts`) into the screen's own
 * Spanish, in place of `unusableFriendlyMessage`'s former companion line.
 *
 * This is the fix for "warm Spanish sentence followed by raw English": that
 * companion used to be `status.detail` rendered VERBATIM — the main
 * process's own wording, e.g. `Probe timed out after 4000ms`. `detail` still
 * arrives on the payload (kept for diagnostics and logs) but this function
 * never reads it; only the typed `reason` may become copy here, the same
 * discipline `describeAskArtifact` holds for generated-artifact outcomes.
 *
 * `null` covers both a status that never carried a structured reason (an
 * older cached observation) and a code this map has not been taught yet —
 * both fall back to the SAME generic sentence, never to `status.detail` and
 * never to a bare code, matching `describeIpcErrorCode`'s standing rule for
 * IPC error codes.
 */
export function describeCliFailureReason(reason: CliProbeFailureReason | null): string {
  if (reason === null) {
    return i18n.t('ajustes:connectionDisplay.failureReason.generic')
  }
  if (reason.code === 'invalid-executable') {
    return i18n.t('ajustes:connectionDisplay.failureReason.invalidExecutable', { path: reason.path })
  }
  if (reason.code === 'timeout') {
    return i18n.t('ajustes:connectionDisplay.failureReason.timeout', { timeoutMs: reason.timeoutMs })
  }
  if (reason.code === 'exit-code') {
    return i18n.t('ajustes:connectionDisplay.failureReason.exitCode', {
      code: reason.exitCode ?? i18n.t('ajustes:connectionDisplay.failureReason.unknownExitCode')
    })
  }
  return i18n.t('ajustes:connectionDisplay.failureReason.unrecognizedOutput')
}

/**
 * What the settings screen says about an installed binary's capabilities.
 *
 * This exists because the three CLIs are NOT interchangeable, and hiding that
 * would make the app feel broken in ways the user cannot diagnose. Two
 * differences are worth a row each:
 *
 *  - `warmSession`: only Claude has a duplex stdin one process can be fed
 *    question after question through. A provider without it pays the CLI's
 *    full boot on every question — measured at ~15.5s against ~5.5s warm. A
 *    user who switches CLIs and finds every answer three times slower deserves
 *    to have been told, not left guessing.
 *  - `readOnlyTools`: every CLI the app offers today can be confined to a
 *    read-only tool set at the spawn boundary — `--allowed-tools`,
 *    `--mode plan`, `--sandbox read-only`. That is not a given: a headless CLI
 *    with no allowlist flag rests its containment on there being nobody present
 *    to approve an action, which is weaker, and this row is what says so
 *    instead of dressing it up.
 */
export interface CapabilityRow {
  /** Stable identity, so a caller can drop one row without matching on its Spanish label. */
  key: 'structuredOutput' | 'warmSession' | 'readOnlyTools'
  label: string
  supported: boolean
  /** Shown when `supported` is false — why it matters, in the user's terms. */
  caveat: string
}

export function capabilityRows(status: CliProviderStatus): CapabilityRow[] {
  // Nothing observed yet, or a CLI that is not connected: an unprobed binary
  // gets no claims made about it in either direction.
  if (status.capabilities === null) {
    return []
  }

  return [
    {
      key: 'structuredOutput' as const,
      label: i18n.t('ajustes:connectionDisplay.capability.structuredOutput.label'),
      supported: status.capabilities.structuredOutput,
      caveat: i18n.t('ajustes:connectionDisplay.capability.structuredOutput.caveat')
    },
    {
      key: 'warmSession' as const,
      label: i18n.t('ajustes:connectionDisplay.capability.warmSession.label'),
      supported: status.capabilities.warmSession,
      caveat: i18n.t('ajustes:connectionDisplay.capability.warmSession.caveat')
    },
    {
      key: 'readOnlyTools' as const,
      label: i18n.t('ajustes:connectionDisplay.capability.readOnlyTools.label'),
      supported: status.capabilities.readOnlyTools,
      caveat: i18n.t('ajustes:connectionDisplay.capability.readOnlyTools.caveat')
    }
  ]
}

/**
 * `true` when the app will refuse to ask this provider anything, even though
 * its binary was found and runs.
 *
 * A CLI can be perfectly installed and still be unusable here: an argv template
 * written from documentation and never run against a real binary stays inert
 * until a probe confirms the installed version accepts it. Showing "Conectado"
 * with no further explanation in that case would be the most confusing screen
 * the app could draw.
 */
export function isInertDespiteConnection(status: CliProviderStatus): boolean {
  return status.status === 'connected' && status.capabilities?.structuredOutput === false
}

export const INERT_MESSAGE = i18n.t('ajustes:connectionDisplay.inertMessage')

// --- manual path visibility --------------------------------------------------

/**
 * Whether a provider row shows the manual-path field at all.
 *
 * Asking someone to configure an advanced override for something that already
 * works is asking them to solve a problem they do not have, so a healthy
 * autodetected CLI shows no field — that is what collapses its row to a single
 * line. It stays open for the three cases where a path is the actual fix or the
 * actual subject:
 *
 *  - `not-found` / `unusable` — nothing works; the path is the way out.
 *  - connected but INERT — found and runnable, but the installed version
 *    rejects the options the app needs, and pointing at another build is the
 *    fix.
 *  - already running from an override — hiding it would leave the user unable
 *    to see which path is in force or to clear it back to autodetection.
 *
 * NOTE: this gate belongs to the CARD, never inside `InlinePathInput` itself.
 * The card drives the field AND its execution warning (design D9) from this one
 * boolean, which is what keeps the two from ever drifting apart — see
 * `ConnectionStatusCard.test.tsx`, "path field and execution warning move
 * together".
 */
export function shouldShowManualPath(status: CliProviderStatus): boolean {
  return status.status !== 'connected' || status.source === 'override' || isInertDespiteConnection(status)
}
