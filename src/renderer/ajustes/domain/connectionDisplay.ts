// Pure, framework-free domain module (design D7/D9) — the mapping from a
// `CliProviderStatus` to what the settings screen shows. No electron/IPC
// import, same convention as `materias/domain/subjectStatus.ts`.
import type { CliProvider, CliProviderStatus } from '../../../shared/ipc/cli'

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
  claude: 'Claude Code',
  gemini: 'Gemini CLI',
  codex: 'Codex CLI'
}

/** The command each card's probe actually runs, named in its own policy note. */
export const PROVIDER_COMMANDS: Record<CliProvider, string> = {
  claude: 'claude --version',
  gemini: 'gemini --version',
  codex: 'codex --version'
}

/**
 * Trust-boundary control (design D9), not decoration: the ONLY user-facing
 * compensating control for a boundary that admits no allowlist. Value is
 * exact per the approved `.pen` design (node `kLczV`, frame "Grupo —
 * Ajustes" › "Card — Ruta manual" › "Warning Note"), generalized from
 * "un ejecutable de Claude" to name whichever CLI the card belongs to —
 * pointing a Gemini card at a Claude warning would be worse than no warning.
 * Rendered UNCONDITIONALLY whenever the manual-path card renders — never
 * gated on status, override presence, or focus.
 */
export function executionWarningCopy(provider: CliProvider): string {
  return `La app va a EJECUTAR el archivo que indiques acá. Apuntá solo a un ejecutable de ${PROVIDER_LABELS[provider]} en el que confíes.`
}

/**
 * Friendly Spanish message for the `unusable` state (spec "Unusable Detail
 * Copy"): shown alongside one technical detail line. The technical line is
 * `CliProviderStatus.detail` used verbatim — the main process's own wording
 * is not altered here, only prefaced by this friendlier sentence.
 *
 * Deliberately says nothing about WHERE the executable came from. `unusable`
 * covers both an override the user typed and a binary autodetected on PATH,
 * so wording like "el que configuraste" would send a user who never touched
 * the setting looking for a setting they never changed.
 */
export function unusableFriendlyMessage(provider: CliProvider): string {
  return `Encontramos ${PROVIDER_LABELS[provider]}, pero no pudimos usarlo.`
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
 *  - `readOnlyTools`: Claude and Codex can be confined to a read-only tool set
 *    at the spawn boundary. Gemini's headless mode offers no allowlist flag at
 *    all, so its containment rests on there being nobody present to approve an
 *    action. That is weaker, and this row says so rather than dressing it up.
 */
export interface CapabilityRow {
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
      label: 'Respuestas estructuradas',
      supported: status.capabilities.structuredOutput,
      caveat: 'Este CLI no acepta las opciones que la app necesita para leer sus respuestas.'
    },
    {
      label: 'Proceso reutilizable',
      supported: status.capabilities.warmSession,
      caveat: 'Cada pregunta arranca el CLI de cero, así que tarda bastante más.'
    },
    {
      label: 'Solo lectura garantizada',
      supported: status.capabilities.readOnlyTools,
      caveat: 'Este CLI no permite limitar sus herramientas, así que la app no puede garantizarlo.'
    }
  ]
}

/**
 * `true` when the app will refuse to ask this provider anything, even though
 * its binary was found and runs.
 *
 * A CLI can be perfectly installed and still be unusable here: two of the
 * three argv templates were written from documentation and never run against a
 * real binary, so they stay inert until a probe confirms the installed version
 * accepts them. Showing "Conectado" with no further explanation in that case
 * would be the most confusing screen the app could draw.
 */
export function isInertDespiteConnection(status: CliProviderStatus): boolean {
  return status.status === 'connected' && status.capabilities?.structuredOutput === false
}

export const INERT_MESSAGE =
  'Encontramos este CLI, pero la versión instalada no acepta las opciones que la app necesita. Todavía no se puede preguntar con él.'

// --- manual path visibility --------------------------------------------------

/** Section title inside a provider card — the card already names the CLI. */
export const MANUAL_PATH_TITLE = 'Ruta manual'

/**
 * The collapsed form of the manual-path section, shown when the CLI was found
 * on the PATH and works.
 *
 * It is not decoration. Autodetection resolves the FIRST match on the PATH,
 * which can be an old build the user forgot about — and a card reporting
 * "Conectado" with no way to point elsewhere would leave them stuck with it.
 */
export const MANUAL_PATH_LINK_ACTION = 'Usar otra ruta'
export const MANUAL_PATH_LINK_HINT = 'si detectó el ejecutable equivocado'

/**
 * Whether a provider card shows the manual-path field expanded by default.
 *
 * Asking someone to configure an advanced override for something that already
 * works is asking them to solve a problem they do not have, so a healthy
 * autodetected CLI collapses it behind the link above. It stays open for the
 * three cases where a path is the actual fix or the actual subject:
 *
 *  - `not-found` / `unusable` — nothing works; the path is the way out.
 *  - connected but INERT — found and runnable, but the installed version
 *    rejects the options the app needs, and pointing at another build is the
 *    fix.
 *  - already running from an override — hiding it would leave the user unable
 *    to see which path is in force or to clear it back to autodetection.
 *
 * NOTE: this gate belongs to the CARD, never inside the manual-path block
 * itself. The block is all-or-nothing, which is what keeps the execution
 * warning (design D9) rendering unconditionally whenever the field renders —
 * see `ManualPathCard.test.tsx`, which forbids threading status into it.
 */
export function shouldShowManualPath(status: CliProviderStatus): boolean {
  return status.status !== 'connected' || status.source === 'override' || isInertDespiteConnection(status)
}
