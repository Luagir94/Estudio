import {
  CalendarDays,
  CircleCheck,
  CloudOff,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  Library,
  Minus,
  type LucideIcon
} from 'lucide-react'
import type { AskArtifactReport, Citation, CitationSection } from '../../../shared/ipc/ask'
import {
  ASK_CITATIONS_LABEL,
  ASK_GENERAL_MARKER,
  ASK_MEMORY_BOUNDARY_MARKER,
  ASK_NOT_SAVED,
  ASK_SECTION_LABELS,
  describeAskArtifact
} from '../domain/askDisplay'
import { AskStateCard } from './AskStateCard'

export type AskEntry =
  | { kind: 'question'; id: number; text: string }
  /** `notSaved` (design #268 §2): a write-failure signal on a RESULT entry —
   * never on `question`, which is never itself unsaved. */
  | { kind: 'answer'; id: number; text: string; citations: readonly Citation[]; notSaved?: boolean }
  | { kind: 'general'; id: number; text: string; notSaved?: boolean }
  | { kind: 'state'; id: number; icon: LucideIcon; title: string; detail: string; notSaved?: boolean }
  /** The memory-boundary honesty marker (design D2/D6, spec "Memory-Boundary
   * Honesty Marker"). Placement is `historyEntries.toEntries`' job; this kind
   * only renders it. Visual per design #268 §1: a NEUTRAL pill, never amber. */
  | { kind: 'boundary'; id: number }

/** `T extends unknown` forces the omit to DISTRIBUTE — a plain `Omit` over a union collapses it to the shared keys. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * An entry as the container supplies it; the id is assigned on append.
 * `boundary` is excluded (validator #264 mandatory fix 4): it must derive
 * from `historyEntries.toEntries`' window computation, never be minted
 * optimistically by the container. `Exclude` first drops that member, so
 * `append({ kind: 'boundary' })` is a type error, not merely an unused
 * possibility.
 */
export type AskEntryInput = DistributiveOmit<Exclude<AskEntry, { kind: 'boundary' }>, 'id'>

interface AskTranscriptProps {
  entries: readonly AskEntry[]
  /**
   * The current live turn's generated-artifact outcome, if any (design D6) —
   * NEVER a field on `AskEntry`/`entries`, because it must render for a turn
   * regardless of whether that turn's result came from `localEntries` (an
   * unsaved write) or from freshly-persisted history. It is threaded in by
   * the container from the live `AskTurnResponse` only; `entries` — including
   * anything built by `toEntries` off persisted messages — can never carry
   * one, which is what makes reopening a past conversation unable to replay
   * it (spec "Reopening a conversation does not replay the outcome line").
   */
  liveArtifact?: AskArtifactReport
}

const SECTION_ICONS: Record<CitationSection, LucideIcon> = {
  materias: Library,
  horario: CalendarDays,
  entregas: CircleCheck,
  finales: GraduationCap,
  carreras: Layers
}

function citationIcon(citation: Citation): LucideIcon {
  return citation.kind === 'archivo' ? FileText : SECTION_ICONS[citation.section]
}

function citationLabel(citation: Citation): string {
  if (citation.kind === 'archivo') {
    // `page` is optional (page-number citations): old history rows and
    // non-paged documents have none, and their label stays exactly two-part.
    const base = `${citation.subject} · ${citation.file}`
    return citation.page === undefined ? base : `${base} · pág. ${citation.page}`
  }
  return `${ASK_SECTION_LABELS[citation.section]} · ${citation.label}`
}

function Chip({ icon: Icon, label }: { icon: LucideIcon; label: string }): React.JSX.Element {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-body-sm font-medium text-ink-secondary">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {label}
    </span>
  )
}

/** The amber not-saved pill (design #268 §2) — sits under a result entry,
 * never replaces it. Deliberately asymmetric with the neutral boundary pill. */
function NotSavedMarker(): React.JSX.Element {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-label font-medium text-warn">
      <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
      {ASK_NOT_SAVED}
    </span>
  )
}

/**
 * The answer and its citations are THIRD-PARTY text: attachments are written
 * by professors and course platforms, not by the student. So every
 * model-authored string lands here as a React text node and nothing else —
 * no markdown rendering, no `dangerouslySetInnerHTML`, no linkification, no
 * click-to-open. There is deliberately no path by which model output can
 * trigger an app action.
 *
 * ONE BOUNDED, SINGLE EXCEPTION (cli-generated-artifacts design's "Validation
 * Gate" section): `liveArtifact` reports the outcome of a generated-document
 * save that already happened entirely inside `askService`, behind a single
 * validation gate, before this component ever renders — this transcript
 * itself never triggers that write, only reports it. The report still stays
 * fully action-free: it renders as one plain `<p>` text node built from
 * APP-OWNED copy (`describeAskArtifact`), with no anchor, no `onClick`, and
 * no markdown/link parsing — the only model-adjacent values it ever shows are
 * the already-sanitized `fileName`/`subjectName`. Every other model-output
 * field (citations, general text, and any future field) stays exactly as
 * inert as described above; this is the sole precedent, not a pattern to
 * extend without a new, separately reviewed exception.
 *
 * A `general` entry is an answer the model produced WITHOUT the student's
 * corpus. It renders with an unmissable marker, because that marker is the
 * only thing distinguishing it from a sourced answer.
 */
export function AskTranscript({ entries, liveArtifact }: AskTranscriptProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => {
        if (entry.kind === 'question') {
          return (
            <div key={entry.id} className="flex justify-end">
              <p className="max-w-[280px] rounded-xl bg-violet-soft px-3 py-2.5 text-body leading-relaxed text-foreground">
                {entry.text}
              </p>
            </div>
          )
        }

        if (entry.kind === 'state') {
          return (
            <div key={entry.id} className="flex flex-col items-center gap-2.5">
              <AskStateCard icon={entry.icon} title={entry.title} detail={entry.detail} />
              {entry.notSaved && <NotSavedMarker />}
            </div>
          )
        }

        if (entry.kind === 'boundary') {
          return (
            <div key={entry.id} className="flex items-center justify-center py-1">
              <span className="flex w-fit items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-label font-medium text-muted-foreground">
                <Minus className="size-3.5 shrink-0" aria-hidden="true" />
                {ASK_MEMORY_BOUNDARY_MARKER}
              </span>
            </div>
          )
        }

        if (entry.kind === 'general') {
          return (
            <div key={entry.id} className="flex flex-col gap-2.5">
              <p className="text-body leading-relaxed whitespace-pre-wrap text-foreground">{entry.text}</p>
              <span className="flex w-fit items-center gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-label font-medium text-warn">
                <Globe className="size-3.5 shrink-0" aria-hidden="true" />
                {ASK_GENERAL_MARKER}
              </span>
              {entry.notSaved && <NotSavedMarker />}
            </div>
          )
        }

        return (
          <div key={entry.id} className="flex flex-col gap-2.5">
            <p className="text-body leading-relaxed whitespace-pre-wrap text-foreground">{entry.text}</p>
            <div className="flex flex-col gap-1.5">
              <p className="text-overline font-semibold text-muted-foreground">{ASK_CITATIONS_LABEL}</p>
              {entry.citations.map((citation, index) => (
                <Chip
                  key={`${citationLabel(citation)}-${index}`}
                  icon={citationIcon(citation)}
                  label={citationLabel(citation)}
                />
              ))}
            </div>
            {entry.notSaved && <NotSavedMarker />}
          </div>
        )
      })}
      {liveArtifact && <p className="text-label text-muted-foreground">{describeAskArtifact(liveArtifact)}</p>}
    </div>
  )
}
