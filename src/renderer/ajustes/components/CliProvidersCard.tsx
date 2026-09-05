// Presentational (approved `.pen`, node "Card — CLIs detectados", screen
// "Ajustes · Integraciones"): ONE card holding one row per CLI, plus the
// single execution warning that covers all of them.
//
// It replaces three separate cards — "Card — Claude Code", "Card — Antigravity
// CLI", "Card — Codex CLI" — that were the same five things five times: mark,
// name, status, path field, warning. Three cards said "these are three
// unrelated subjects"; they are one list of the same subject, and the screen
// now says so. `McpClientTargetsCard` already made this call for its own rows.
//
// It owns NO state and takes no provider: the container hands it the rows it
// has already decided on (idle, detecting or answered), because which state a
// row is in is a question about a query, and queries live in the container.
import { Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ExecutionWarning } from './ExecutionWarning'

interface CliProvidersCardProps {
  /** How many CLIs are connected right now — shown in the head, not inferred from `children`. */
  connectedCount: number
  /** How many CLIs this app can talk to at all. */
  totalCount: number
  /**
   * One row per provider, already in the state the container resolved.
   *
   * Optional so the card still renders its head and — the part that matters —
   * its execution warning when there is nothing to list. A card that dropped
   * the D9 warning because it happened to have no rows would drop it exactly
   * when the screen is least explained.
   */
  children?: ReactNode
}

export function CliProvidersCard({ connectedCount, totalCount, children }: CliProvidersCardProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Terminal className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body-lg font-semibold text-foreground">{t('cliProvidersCard.title')}</h3>
            <p className="text-body text-secondary-foreground">
              {t('cliProvidersCard.description', { count: connectedCount, total: totalCount })}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-border" />

      <div className="flex flex-col gap-3">{children}</div>

      {/* Unconditional, and card-level rather than row-level. Design D9: the
          app EXECUTES whatever a path field points at, and every row above can
          be given one. */}
      <ExecutionWarning />
    </div>
  )
}
