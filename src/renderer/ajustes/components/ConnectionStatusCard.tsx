// Presentational (approved `.pen`, rows "CLI Row — Claude Code" / "CLI Row —
// Codex CLI" inside "Card — CLIs detectados"): one ROW per CLI, in one of two
// shapes.
//
// A ROW, not a card — no border and no surface of its own. Its execution
// warning moved out too: the card owns ONE for all three rows, because the
// boundary is the same one in each. See `ExecutionWarning.tsx`.
//
// A HEALTHY, autodetected CLI collapses to a single line: mark, name, green
// chip, nothing else. The version, the resolved path, the origin and the three
// capability rows are all answers to questions a working CLI does not raise —
// showing them made the screen read like a diagnostics dump for a thing that
// was fine.
//
// Every other case keeps the path field, because in every one of them a path
// is either the fix or the subject: not found, unusable, connected-but-inert,
// or already running from an override the user must be able to see and clear.
// That rule is `shouldShowManualPath` and it is unchanged — the design moved,
// not the policy.
//
// The green chip IS the re-probe button. Collapsing to one line would otherwise
// have removed the only way to re-check a CLI, and a row that cannot be
// re-checked is a row that lies the moment the user upgrades their install.
//
// No container, no react-query, no IPC here — this component only reads the
// DTO it is handed.
import { RefreshCw, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CliProviderStatus } from '../../../shared/ipc/cli'
import {
  capabilityRows,
  describeCliFailureReason,
  DISCONNECT_ACTION,
  INERT_MESSAGE,
  isInertDespiteConnection,
  PROVIDER_LABELS,
  resolveConnectionTone,
  RETRY_ACTION,
  shouldShowManualPath,
  unusableFriendlyMessage,
  type ConnectionTone
} from '../domain/connectionDisplay'
import { InlinePathInput } from './InlinePathInput'
import { ProviderMark } from './ProviderMark'

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

interface ConnectionStatusCardProps {
  status: CliProviderStatus
  /** Reports a committed override for THIS provider — `null` clears it. */
  onCommitPath: (path: string | null) => void
  /** Re-probes THIS provider only. The screen has no "re-probe everything" control. */
  onReprobe: () => void
  /** Withdraws the opt-in, returning this row to idle. Connecting has to be reversible. */
  onDisconnect: () => void
  /** The row keeps its previous values during a re-probe, so the control is the only place to say so. */
  isReprobing: boolean
}

export function ConnectionStatusCard({
  status,
  onCommitPath,
  onReprobe,
  onDisconnect,
  isReprobing
}: ConnectionStatusCardProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')
  const tone = resolveConnectionTone(status.status)
  // Drives the path field only. It used to drive this row's own execution
  // warning too, so the two could not drift apart; the warning is the card's
  // now and is unconditional, which keeps the guarantee the old pairing gave —
  // no field ever appears without it — without three copies of the sentence.
  const showsPath = shouldShowManualPath(status)
  // Only the caveats of capabilities the binary does NOT have. `structuredOutput`
  // is dropped when inert because `INERT_MESSAGE` above already says it, at
  // more length and in plainer words.
  const caveats = capabilityRows(status)
    .filter((row) => !row.supported && !(row.key === 'structuredOutput' && isInertDespiteConnection(status)))
    .map((row) => row.caveat)

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderMark provider={status.provider} className="h-[18px] w-[18px] text-secondary-foreground" />
          <h4 className="text-body-lg font-semibold text-foreground">{PROVIDER_LABELS[status.provider]}</h4>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* The chip is a BUTTON, not a label. On a collapsed healthy row it is
              the only control left, and losing the ability to re-check would be
              worse than the line it saves. */}
          <button
            type="button"
            onClick={onReprobe}
            disabled={isReprobing}
            aria-busy={isReprobing}
            aria-label={`${RETRY_ACTION} ${PROVIDER_LABELS[status.provider]}`}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-semibold transition-opacity duration-150 ease-out hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 ${CHIP_STYLES[tone]}`}
          >
            {isReprobing ? (
              <RefreshCw className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${CHIP_DOT_STYLES[tone]}`} />
            )}
            {/* Only `connected`'s label ("Conectado") is drawn in the approved
                `.pen`. The other two are inferred, disclosed Spanish labels
                that parallel the spec's own "Three-State Status
                Classification" wording. */}
            {t(`connectionStatusCard.statusLabel.${status.status}`)}
          </button>

          {/* Connecting has to be reversible. Without this the opt-in would be
              a one-way door: a CLI connected once would be re-probed on every
              launch forever, with no way back to "the app runs nothing". Icon
              only, because the row's job is to be one line — the accessible
              name carries the words. */}
          <button
            type="button"
            onClick={onDisconnect}
            aria-label={`${DISCONNECT_ACTION} ${PROVIDER_LABELS[status.provider]}`}
            title={DISCONNECT_ACTION}
            className="flex items-center rounded-lg border border-border bg-muted px-2.5 py-2 text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/70 hover:text-foreground active:bg-muted/50"
          >
            <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {showsPath && (
            <InlinePathInput provider={status.provider} overridePath={status.overridePath} onCommit={onCommitPath} />
          )}
        </div>
      </div>

      {/* A CLI that runs but whose installed version rejects the options this
          app needs. "Conectado" alone would be the most confusing thing the
          screen could say, so the reason is spelled out. */}
      {isInertDespiteConnection(status) && <p className="text-body-sm text-muted-foreground">{INERT_MESSAGE}</p>}

      {/* The capability rows are gone, but their CAVEATS are not, and that
          distinction is the whole point: a supported capability is silence, so
          a fully capable CLI really does collapse to one line. A MISSING one is
          a fact the user cannot discover any other way — that answers will be
          three times slower, or that the app cannot confine this CLI to reading
          — and dropping it to save a line would be hiding the only warning
          about it that exists. */}
      {caveats.length > 0 && <p className="text-body-sm text-muted-foreground">{caveats.join(' ')}</p>}

      {status.status === 'unusable' && (
        // `status.detail` stays on the payload for diagnostics/logs but is
        // NEVER rendered here — `describeCliFailureReason` is the localized,
        // app-owned account of the SAME failure (i18n phase 2 "CLI probe
        // reasons"), never the main process's own English wording.
        <p className="text-body-sm text-muted-foreground">
          {unusableFriendlyMessage(status.provider)} · {describeCliFailureReason(status.failureReason)}
        </p>
      )}
    </div>
  )
}
