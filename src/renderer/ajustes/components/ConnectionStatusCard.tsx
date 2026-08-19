// Presentational (design node `baO7H` "Card — Conexión", frame "Grupo —
// Ajustes"): the connection state chip plus the Versión/Ejecutable/Origen
// detail rows (spec "Status Display"), and, only when `unusable`, the
// friendly Spanish message plus the one technical detail line (spec
// "Unusable Detail Copy") — `status.detail` is rendered VERBATIM, never
// reworded or truncated.
//
// One card per supported CLI now, so everything that used to be Claude's by
// assumption is read off the DTO instead. The capability rows below are new:
// the three CLIs are not interchangeable, and a screen that hid that would
// leave the user unable to explain why one of them is slow or refused.
//
// No container, no react-query, no IPC here — this component only reads the
// DTO it is handed.
import { Check, FolderCog, Minus, Terminal } from 'lucide-react'
import { useState } from 'react'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import {
  capabilityRows,
  INERT_MESSAGE,
  isInertDespiteConnection,
  MANUAL_PATH_LINK_ACTION,
  MANUAL_PATH_LINK_HINT,
  PROVIDER_LABELS,
  resolveConnectionTone,
  shouldShowManualPath,
  unusableFriendlyMessage,
  type ConnectionTone
} from '../domain/connectionDisplay'
import { ManualPathCard } from './ManualPathCard'

// Presentational tone→Tailwind mapping (design D7's own split, left to this
// layer — see `SubjectStatusBadge.tsx`'s `STATUS_STYLES`/`DOT_STYLES` for
// the established pattern this follows). `urgent` uses the raw token, NOT
// `border-destructive`/`text-destructive` — design D7 reserves the
// `destructive` alias for destructive ACTIONS, not status signalling.
const CHIP_STYLES: Record<ConnectionTone, string> = {
  ok: 'border-ok bg-ok-soft text-ok',
  warn: 'border-warn bg-warn-soft text-warn',
  urgent: 'border-urgent bg-urgent-soft text-urgent'
}

const CHIP_DOT_STYLES: Record<ConnectionTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  urgent: 'bg-urgent'
}

// Only `connected`'s label ("Conectado") is drawn in the approved `.pen` —
// see PR5 apply-progress. The other two are inferred, disclosed Spanish
// labels that parallel the spec's own "Three-State Status Classification"
// wording ("not resolvable" / "the app had something concrete and it
// failed").
const STATUS_LABELS: Record<CliProviderStatus['status'], string> = {
  connected: 'Conectado',
  'not-found': 'No encontrado',
  unusable: 'No funciona'
}

// `auto`'s copy is exact per the approved `.pen` ("Detección automática en
// el PATH"); `override` has no drawn example and is an inferred, disclosed
// parallel phrase.
const SOURCE_LABELS: Record<CliProviderStatus['source'], string> = {
  auto: 'Detección automática en el PATH',
  // Not simply "Ruta manual": that is now the heading of the section directly
  // below, and the row would read as a label for it rather than as the origin
  // of the executable above.
  override: 'Ruta manual configurada'
}

interface ConnectionStatusCardProps {
  status: CliProviderStatus
  /** Reports a committed override for THIS provider — `null` clears it. */
  onCommitPath: (path: string | null) => void
}

export function ConnectionStatusCard({ status, onCommitPath }: ConnectionStatusCardProps): React.JSX.Element {
  const tone = resolveConnectionTone(status.status)
  const capabilities = capabilityRows(status)

  // Local, and deliberately not lifted: revealing the field is a glance at an
  // advanced control, not a decision worth persisting or sharing. It resets on
  // remount, which is the honest behaviour — the card reverts to describing
  // the CLI rather than to a half-finished edit.
  const [revealed, setRevealed] = useState(false)
  const expanded = revealed || shouldShowManualPath(status)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="h-[18px] w-[18px] text-secondary-foreground" aria-hidden="true" />
          <h3 className="text-body-lg font-semibold text-foreground">{PROVIDER_LABELS[status.provider]}</h3>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-semibold ${CHIP_STYLES[tone]}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${CHIP_DOT_STYLES[tone]}`} />
          {STATUS_LABELS[status.status]}
        </span>
      </div>

      <div aria-hidden="true" className="h-px w-full bg-border" />

      <div className="flex flex-col gap-2">
        <DetailRow label="Versión" value={status.version ?? '—'} />
        <DetailRow label="Ejecutable" value={status.resolvedPath ?? '—'} />
        <DetailRow label="Origen" value={SOURCE_LABELS[status.source]} />
      </div>

      {capabilities.length > 0 && (
        <>
          <div aria-hidden="true" className="h-px w-full bg-border" />
          <ul className="flex flex-col gap-2">
            {capabilities.map((row) => (
              <li key={row.label} className="flex items-start gap-3">
                {row.supported ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
                ) : (
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-sm text-secondary-foreground">
                    {row.label}
                    <span className="sr-only">{row.supported ? ': disponible' : ': no disponible'}</span>
                  </span>
                  {!row.supported && <span className="text-caption text-muted-foreground">{row.caveat}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* A CLI that runs but whose installed version rejects the options this
          app needs. "Conectado" alone would be the most confusing thing the
          screen could say, so the reason is spelled out. */}
      {isInertDespiteConnection(status) && (
        <p className="text-body-sm font-semibold text-foreground">{INERT_MESSAGE}</p>
      )}

      {status.status === 'unusable' && (
        <div className="flex flex-col gap-1">
          <p className="text-body-sm font-semibold text-foreground">{unusableFriendlyMessage(status.provider)}</p>
          <p className="text-caption text-muted-foreground">{status.detail}</p>
        </div>
      )}

      <div aria-hidden="true" className="h-px w-full bg-border" />

      {/* The manual-path gate lives HERE, at the card, and never inside
          `ManualPathCard`. That block stays all-or-nothing, which is what keeps
          its execution warning (design D9) unconditional whenever the field
          renders — the component still takes no `status` prop. */}
      {expanded ? (
        <ManualPathCard provider={status.provider} overridePath={status.overridePath} onCommit={onCommitPath} />
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex items-center gap-2 self-start text-body-sm"
        >
          <FolderCog className="h-3.5 w-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
          <span className="font-semibold text-primary-ink">{MANUAL_PATH_LINK_ACTION}</span>
          <span className="text-muted-foreground">{MANUAL_PATH_LINK_HINT}</span>
        </button>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[110px] shrink-0 text-body-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-body-sm text-secondary-foreground">{value}</span>
    </div>
  )
}
