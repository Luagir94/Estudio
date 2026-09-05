// Presentational (approved `.pen`, design node `eRwDu` "Card — Conexión
// MCP", PR 15 of mcp-app-control): the ONLY place the plaintext token this
// session may have issued is ever held. `mcp:status` cannot read it back —
// only its hash is persisted (design D7) — so the container passes it
// through local state on the WAY BACK from `mcp:issueToken`'s own result,
// never from a second fetch, and this component never tries to re-fetch it
// either.
//
// No container, no react-query, no IPC here — same rule as every other card
// on this screen.
import { Ban, Copy, EyeOff, PlugZap, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { McpListenerState, McpStatusResult } from '../../../shared/ipc/mcp'
import { buildClientConfig } from '../../mcp/domain/buildClientConfig'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'

// Only `listening`'s label ("Escuchando") is drawn in the approved `.pen` —
// same rule `ConnectionStatusCard.tsx`'s `CHIP_STYLES` follows for its own
// inferred states. `stopped`/`error` are this component's own disclosed
// Spanish wording for the other two `McpListenerState` values, since no
// token/grant yet or a listener error are both real states this card must
// be able to show honestly, not just the canonical connected screenshot.
const CHIP_STYLES: Record<McpListenerState, string> = {
  listening: 'border-ok bg-ok-soft text-ok',
  stopped: 'border-border bg-muted text-muted-foreground',
  error: 'border-urgent bg-urgent-soft text-urgent'
}

const BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60'

interface McpTokenCardProps {
  /**
   * The clients holding this token, rendered below a divider inside this same
   * card (approved `.pen`, node `eRwDu`).
   *
   * They were a separate card until the redesign, which said the token and the
   * clients that hold it were two subjects. They are one: rotating here
   * rewrites every config written there, and revoking tears them all down. The
   * card boundary was hiding that.
   */
  children?: ReactNode
  status: McpStatusResult
  /** The plaintext token from the MOST RECENT issue/rotate this session — `null` before any this session, or once revoked. */
  issuedToken: string | null
  /** Issues the FIRST token, or rotates the current one — the SAME call either way (design D7/D8). */
  onRotate: () => void
  onRevoke: () => void
  isRotating: boolean
  isRevoking: boolean
}

export function McpTokenCard({
  children,
  status,
  issuedToken,
  onRotate,
  onRevoke,
  isRotating,
  isRevoking
}: McpTokenCardProps): React.JSX.Element {
  const { t } = useTranslation('mcp')

  // Copies the ready-to-paste client config, not the bare token — the token
  // alone still leaves the student typing out `docs/development.md`'s
  // `{ command, args, env }` shape by hand.
  const copyClientConfig = (): void => {
    if (issuedToken) {
      void navigator.clipboard.writeText(buildClientConfig(status.shimPath, issuedToken))
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlugZap className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <h3 className="text-body-lg font-semibold text-foreground">{t('mcpTokenCard.title')}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-semibold',
              CHIP_STYLES[status.listener]
            )}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
            {t(`mcpTokenCard.statusLabel.${status.listener}`)}
          </div>

          <button
            type="button"
            onClick={copyClientConfig}
            disabled={!issuedToken}
            className={cn(BUTTON_CLASS, interactive)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {t('mcpTokenCard.buttons.copy')}
          </button>

          <button
            type="button"
            onClick={onRotate}
            disabled={isRotating}
            aria-busy={isRotating}
            className={cn(BUTTON_CLASS, interactive)}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRotating && 'animate-spin')} aria-hidden="true" />
            {t('mcpTokenCard.buttons.rotate')}
          </button>

          <button
            type="button"
            onClick={onRevoke}
            disabled={isRevoking || status.tokenIssuedAt === null}
            aria-busy={isRevoking}
            className={cn(BUTTON_CLASS, interactive)}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            {t('mcpTokenCard.buttons.revoke')}
          </button>
        </div>
      </div>

      <p className="text-body-sm text-muted-foreground">{t('mcpTokenCard.detailLine')}</p>

      {/* `listenerError` is non-null only in the `error` state, surfaced for
          troubleshooting per the contract's own doc comment — never a secret. */}
      {status.listener === 'error' && status.listenerError && (
        <p className="text-body-sm text-muted-foreground">{status.listenerError}</p>
      )}

      {issuedToken && (
        <>
          <div className="w-[350px] rounded-lg border border-border bg-background px-3 py-2">
            <p className="break-all font-mono text-body-sm text-foreground">{issuedToken}</p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2">
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
            <p className="text-body-sm font-medium text-warn">{t('mcpTokenCard.warning')}</p>
          </div>
        </>
      )}

      {/* The hairline is the whole of the boundary between the token above and
          the clients holding it below — one card, two halves, because the two
          are one subject (approved `.pen`, node `p3QEln` "Card Divider"). */}
      {children && (
        <>
          <div className="h-px w-full bg-border" />
          {children}
        </>
      )}
    </div>
  )
}
