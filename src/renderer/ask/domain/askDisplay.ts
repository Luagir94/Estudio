import type { AskArtifactDropReason, AskArtifactReport, AskErrorCode, CitationSection } from '../../../shared/ipc/ask'
import type { CliProvider, ModelSelection } from '../../../shared/ipc/cli'

// Every user-facing string for the ask panel (design D7). Main sends a typed
// CODE and, for the size gate, the offending file names — nothing else from
// the process or the model is ever rendered as guidance. Keeping the copy
// here rather than at the call sites is what makes "the app owns the words"
// checkable in one place.
//
// Wording is the approved `design/course-companion` → `Grupo — Preguntar`
// spec; the codes that group does not illustrate follow its voice.

export interface AskErrorCopy {
  title: string
  detail: string
  /** Set when the honest next step is the Ajustes screen, not retrying. */
  action?: 'ajustes'
}

/**
 * The panel's name, and — deliberately — the accessible name of both the
 * floating `AskTrigger` and the panel dialog itself.
 *
 * "Materiales" named only half the corpus: `askService` answers from files
 * read off disk AND from the app's own rows (`materias, horario, entregas,
 * finales, carreras`), so the old wording promised less than the feature
 * delivers. "Cursada" is the scope's real name and is already the app's own
 * word for it (`Sidebar.tsx` renders "Mi Cursada"), so this adopts existing
 * vocabulary rather than inventing any. It is "preguntar SOBRE", not
 * "preguntar A" — you do not ask *to* your coursework.
 *
 * This constant and its two `cursada` siblings below (the composer
 * placeholder and `ASK_PENDING.title`) move together or not at all: one
 * alone contradicts the others (design #273 §2).
 */
export const ASK_PANEL_TITLE = 'Preguntar sobre mi cursada'
export const ASK_MODEL_LABEL = 'Modelo'

/**
 * One row of the model menu (design `Screen — Preguntar · Modelo`).
 *
 * `name` is DERIVED from the model id, never stored here — see
 * `humanizeModelId`. `detail` is empty for a model the app has measured
 * nothing about, and empty is the correct answer: inventing a description
 * would be worse than silence on a row the student spends their own quota
 * from.
 */
export interface AskModelOption extends ModelSelection {
  name: string
  detail: string
  /** Exactly one option across the whole menu carries this, or none does. */
  recommended: boolean
}

/**
 * The models that must ALWAYS be offerable, in menu order.
 *
 * This is a floor, not the menu. Discovery reads state files that belong to
 * other programs, and on the Claude side it is partial by construction:
 * `additionalModelOptionsCache` holds only the models beyond the defaults, and
 * `lastModelUsage` only names what has already been run. On a machine where
 * the CLI is freshly installed, both are empty — and a picker that could not
 * offer Sonnet, its own default, would be broken by its own cleverness.
 *
 * For Antigravity it is not a floor but the ENTIRE menu, and that is the one
 * entry here that is load-bearing rather than defensive. `buildModelGroups`
 * drops a CLI with zero options, and agy publishes its lineup through a
 * `models` SUBCOMMAND — a live network call, not a state file — which this app
 * deliberately does not run. With no baseline rows its section never renders:
 * connected in Ajustes, absent from the picker, with nothing on screen
 * explaining the difference.
 */
export const ASK_BASELINE_MODELS: readonly ModelSelection[] = [
  { provider: 'claude', modelId: 'claude-sonnet-5' },
  { provider: 'claude', modelId: 'claude-opus-5' },
  { provider: 'claude', modelId: 'claude-haiku-4-5-20251001' },
  // Two ids read off `agy models` against the real binary on 2026-08-19: one
  // from the CLI's own Gemini lineage and one Claude, because the account
  // reaches both and offering only one would hide half of what it has. They are
  // listed with no `ASK_MODEL_KNOWLEDGE` entry on purpose — this app has
  // measured nothing about either, and inventing a description for a row the
  // student spends their own quota from would be worse than saying nothing.
  { provider: 'antigravity', modelId: 'gemini-3.1-pro-high' },
  { provider: 'antigravity', modelId: 'claude-sonnet-4-6' }
]

/**
 * What the app has actually MEASURED, keyed by model id.
 *
 * Keyed rather than listed on purpose: this is knowledge about a model, not a
 * decision to offer it. A description attaches when its model turns out to be
 * available and stays silent when it does not, which is what lets the menu
 * grow with the account without the app pretending to know things it does not.
 *
 * The details talk about USAGE, not money. The CLI's `total_cost_usd` is an
 * API-rate equivalence, and a user authenticated with a Pro/Max subscription
 * is not billed per question — they spend their usage limit. "Consume más de
 * tu límite" is true under both auth modes; "más caro" is only true under one.
 *
 * Measured against the installed CLI on one run each: Sonnet ≈ $0.017 / 61 s,
 * Haiku ≈ $0.04–0.08 / 4 s, Opus ≈ $0.485 / 91 s. Haiku is the FASTEST, not
 * the cheapest — cache creation dominates the figure, so it came out costlier
 * than Sonnet.
 */
export const ASK_MODEL_KNOWLEDGE: Readonly<Record<string, string>> = {
  'claude-sonnet-5': 'Equilibrado',
  'claude-opus-5': 'El más capaz · consume mucho más de tu límite',
  'claude-haiku-4-5-20251001': 'El más rápido · unos 4 segundos'
}

/**
 * The FALLBACK recommendation order, for a CLI that publishes none of its own.
 *
 * It is second in line on purpose. Where the vendor ranks its models the
 * vendor wins — Codex does, and it knows its own lineup better than this app
 * ever will. This list exists for Claude, which publishes nothing usable:
 * `orgModelDefaultCache` is null and `modelAccessCache` is empty.
 *
 * Only models the app has MEASURED belong here. Recommending one it merely
 * discovered would be inventing an opinion it cannot defend. Sonnet leads
 * because it measured cheapest AND balanced.
 */
export const ASK_RECOMMENDED_MODELS: readonly string[] = [
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5-20251001'
]

export const ASK_RECOMMENDED_LABEL = 'Recomendado'

/** Label for each CLI — the heading of its section in the model menu. */
export const ASK_PROVIDER_LABEL: Record<CliProvider, string> = {
  claude: 'Claude Code',
  antigravity: 'Antigravity CLI',
  codex: 'Codex CLI'
}

export const ASK_COMPOSER_PLACEHOLDER = 'Preguntá sobre tu cursada…'
export const ASK_COMPOSER_PLACEHOLDER_DEGRADED = 'Conectá un CLI para preguntar'
/**
 * Browsing the conversation list: no thread is on screen, so the composer has
 * nothing to send INTO. It says what to do next rather than going silently
 * grey, and it is deliberately its own string — borrowing the degraded copy
 * above would send a user whose CLI is perfectly healthy to Ajustes to fix
 * nothing.
 */
export const ASK_COMPOSER_PLACEHOLDER_BROWSING = 'Elegí una conversación para seguir preguntando'
export const ASK_DISCLAIMER = 'Esta función usa tu propio uso de Claude'

/**
 * The panel with NO CLI connected at all — not an error, and deliberately not
 * one of the typed `AskErrorCode` shapes.
 *
 * Every entry in `COPY` describes something main OBSERVED while trying to
 * answer. This describes the app never having been given permission to try, so
 * it is the renderer's own account of its own state and stops at the bridge —
 * the same standing `DETECTING_LABEL` has in the settings screen.
 *
 * It is distinct from `CLI_NOT_FOUND`, which means the app looked for the CLI
 * the student chose and did not find it. Here nobody chose one yet.
 */
export const ASK_NO_CLI_CONNECTED: AskErrorCopy = {
  title: 'Conectá un CLI para preguntar',
  detail: 'Todavía no conectaste ninguno. Elegí el que uses en Ajustes.',
  action: 'ajustes'
}
export const ASK_CITATIONS_LABEL = 'FUENTES'

/**
 * Shown on every `general` answer. This label is the ONLY thing separating an
 * answer grounded in the student's own corpus from one the model produced on
 * its own, so it is not decoration — remove it and the panel silently starts
 * mixing the two.
 */
export const ASK_GENERAL_MARKER = 'Respuesta general · no salió de tus datos'

/**
 * Shown once per transcript, at the exact point `computeTranscriptWindow`
 * (design D2) cut the prompt window — the same honesty standard
 * `ASK_GENERAL_MARKER` holds: the student must never mistake "the model has
 * this in mind" for turns that were silently left out of the prompt. Copy
 * pinned verbatim from the approved `.pen` (obs #268 §1) — a NEUTRAL pill,
 * never amber: this is information, not an error.
 */
export const ASK_MEMORY_BOUNDARY_MARKER = 'El modelo ya no ve los mensajes anteriores a esta línea'

/** The "+ Conversación nueva" row atop the history list (design #268 §3, node
 * `L0zOG`) — two spaces after the plus, pinned verbatim. */
export const ASK_NEW_CONVERSATION_LABEL = '+  Conversación nueva'

/** Section key → the word shown on a data citation chip. */
export const ASK_SECTION_LABELS: Record<CitationSection, string> = {
  materias: 'Materias',
  horario: 'Horario',
  entregas: 'Entregas',
  finales: 'Finales',
  carreras: 'Carreras'
}
export const ASK_PENDING = {
  title: 'Buscando en tu cursada…',
  detail: 'Puede tardar. Podés cancelar cuando quieras.'
}

/** The not-found OUTCOME is not an error — the model found nothing, and the app says so in its own words. */
export const ASK_NOT_FOUND: AskErrorCopy = {
  title: 'No encontré eso en tu cursada.',
  detail: 'Probá reformular la pregunta, o revisá si eso está cargado en la app o subido como archivo.'
}

/**
 * Shown when `askApi.question()`'s response reports `conversationId: null`
 * (design D1/D6, visual per #268 §2): the write failed, but the answer above
 * is still valid. A single-line AMBER pill directly under the answer — unlike
 * the neutral boundary marker, this one IS a warning, and the asymmetry is
 * deliberate (approved). The answer itself is never dimmed or replaced.
 */
export const ASK_NOT_SAVED = 'Esta respuesta no se guardó en el historial'

const COPY: Record<AskErrorCode, AskErrorCopy> = {
  VALIDATION_ERROR: {
    title: 'Esa pregunta no se puede enviar',
    detail: 'Tiene que tener texto y no superar los 4000 caracteres.'
  },
  CLI_NOT_FOUND: {
    // Names no CLI in particular. With three selectable providers, copy that
    // said 'Claude' sent a student whose Codex install is the missing one off
    // to install a CLI they were never going to use.
    title: 'No encontramos ese CLI',
    detail: 'El CLI que elegiste no está en tu equipo. Revisá su ruta en Ajustes.',
    action: 'ajustes'
  },
  CLI_UNUSABLE: {
    title: 'El CLI configurado no se puede usar',
    detail: 'La ruta guardada no apunta a un ejecutable válido. Revisala en Ajustes.',
    action: 'ajustes'
  },
  OVERSIZED_ATTACHMENT: {
    title: 'Hay archivos que superan los 32 MB',
    detail: 'Claude no puede leerlos. Sacalos o reemplazalos por versiones más chicas.'
  },
  BUSY: {
    title: 'Ya hay una pregunta en curso',
    detail: 'Esperá a que termine, o cancelala antes de mandar otra.'
  },
  TIMEOUT: {
    title: 'La consulta tardó demasiado',
    detail: 'Se cortó a los 5 minutos. Probá con una pregunta más acotada.'
  },
  OUTPUT_TOO_LARGE: {
    title: 'La respuesta era demasiado larga',
    detail: 'Se cortó para proteger la app. Probá con una pregunta más específica.'
  },
  // Deliberately NOT worded like VALIDATION_ERROR: what did not fit is the
  // question plus every piece of course context the app sends alongside it, so
  // blaming the question alone would send the student off to shorten something
  // that was never the problem.
  PROMPT_TOO_LARGE: {
    title: 'La consulta quedó demasiado grande para este CLI',
    detail: 'Este CLI recibe la pregunta como argumento y tiene un límite. Probá acotarla, o preguntá con otro CLI.'
  },
  MALFORMED_RESPONSE: {
    title: 'La respuesta no vino en el formato esperado',
    detail: 'No la muestro porque no puedo garantizar que tenga sus fuentes. Probá de nuevo.'
  },
  EXECUTION_FAILED: {
    title: 'No se pudo completar la consulta',
    // The 100-page ceiling is undetectable app-side, so it is named as a
    // possible cause rather than pretended away.
    detail: 'Puede ser un problema del CLI, o un PDF de más de 100 páginas, que Claude no puede leer de una vez.'
  },
  CANCELED: {
    title: 'Cancelaste la consulta',
    detail: 'No se envió ninguna respuesta.'
  },
  // The thread the question tried to continue no longer exists (design D1) —
  // distinct from ASK_NOT_FOUND above, which is a model OUTCOME, not an error.
  NOT_FOUND: {
    title: 'Esa conversación ya no existe',
    detail: 'Puede que la hayas borrado. Empezá una conversación nueva.'
  }
}

/**
 * Maps a typed error code to app-owned copy. `detail` from main is used ONLY
 * where it carries app-computed data (the oversized file names) — never for
 * codes whose detail is raw process text.
 */
export function describeAskError(code: AskErrorCode, detail?: string): AskErrorCopy {
  const copy = COPY[code]

  if (code === 'OVERSIZED_ATTACHMENT' && detail) {
    return { ...copy, detail: `${detail} — ${copy.detail}` }
  }

  return copy
}

/**
 * One sentence per closed drop reason (cli-generated-artifacts spec's exact
 * seven-value enum — `askArtifactDropReasonSchema`). App-owned, like every
 * other entry in this file: the CLI never explains itself in its own words
 * here, it only supplies the typed reason this maps from.
 */
const ARTIFACT_DROP_COPY: Record<AskArtifactDropReason, string> = {
  'malformed-block': 'El modelo intentó generar un documento con un formato inválido. No se guardó.',
  'invalid-header': 'El modelo intentó generar un documento con datos inválidos. No se guardó.',
  'empty-content': 'El modelo intentó generar un documento vacío. No se guardó.',
  oversize: 'El modelo intentó generar un documento demasiado grande. No se guardó.',
  'invalid-filename': 'El modelo intentó generar un documento con un nombre de archivo inválido. No se guardó.',
  'unknown-subject': 'El modelo intentó generar un documento para una materia que no encontré. No se guardó.',
  'ambiguous-subject': 'El modelo intentó generar un documento para una materia ambigua. No se guardó.'
}

/**
 * Maps a generated-artifact outcome report to one app-owned, plain-text
 * sentence (cli-generated-artifacts spec "Transcript reporting is plain
 * text, action-free, and transient"). `fileName`/`subjectName` are the ONLY
 * model-adjacent values ever interpolated here — both are already
 * app-validated by `artifactGate.ts` (sanitized filename, exact-resolved
 * subject name) before this report is ever built, so they carry no more
 * trust risk than any other third-party file name already shown elsewhere
 * in this panel (e.g. a citation's `file`).
 */
export function describeAskArtifact(report: AskArtifactReport): string {
  if (report.status === 'saved') {
    return `Se guardó "${report.fileName}" en ${report.subjectName}.`
  }
  if (report.status === 'failed') {
    return `No se pudo guardar "${report.fileName}" en ${report.subjectName}.`
  }
  return ARTIFACT_DROP_COPY[report.reason]
}
