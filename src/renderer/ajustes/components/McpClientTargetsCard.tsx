// Presentational (approved `.pen`, the "Clientes MCP" half of node `eRwDu`
// "Card — Conexión MCP"): registers this app inside another MCP client's own
// config file, one row per enabled client.
//
// A SECTION, not a card. It used to be its own card sitting under the token
// card, which said these were two subjects; they are one — the token, and who
// is holding it. Rotating the token here rewrites every config written there,
// which is exactly the coupling a card boundary was hiding. It renders below
// that card's divider now and carries no surface of its own.
//
// No container, no react-query, no IPC here — same rule as every other card on
// this screen. It also holds no token: `onRegister` carries only the target,
// and the container supplies the plaintext from the same state that feeds
// `McpTokenCard`'s copy button.
import { AppWindow, FileKey, Plug, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CliProvider } from '../../../shared/ipc/cli'
import type { McpClientTarget, McpClientTargetStatus } from '../../../shared/ipc/mcp'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'
import { ProviderMark } from './ProviderMark'

// DISPLAY ONLY. `McpClientTarget` and `CliProvider` are separate enums for a
// reason (one is inbound, one outbound), and this map does not join them — it
// only says which vendor mark to draw, because a client made by Anthropic
// carries Anthropic's mark whichever direction the data flows. A target with no
// mark of its own renders the generic icon.
const TARGET_MARK: Record<McpClientTarget, CliProvider | null> = {
  'claude-code': 'claude',
  'claude-desktop': 'claude',
  cursor: null
}

const BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60'

interface McpClientTargetsCardProps {
  targets: McpClientTargetStatus[]
  /**
   * Whether a plaintext token exists to write.
   *
   * The SAME gate as the copy button on `McpTokenCard`: the token is returned
   * once by `mcp:issueToken` and cannot be read back (design D7), so without
   * one this session there is nothing to register — and registering a client
   * with no token would write a config that can never connect.
   */
  canRegister: boolean
  onRegister: (target: McpClientTarget) => void
  onUnregister: (target: McpClientTarget) => void
  /** The target whose write is in flight, or `null`. */
  pendingTarget: McpClientTarget | null
}

export function McpClientTargetsCard({
  targets,
  canRegister,
  onRegister,
  onUnregister,
  pendingTarget
}: McpClientTargetsCardProps): React.JSX.Element {
  const { t } = useTranslation('mcp')

  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AppWindow className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
          <h4 className="text-body-lg font-semibold text-foreground">{t('mcpClientTargetsCard.title')}</h4>
        </div>
      </div>

      <p className="text-body-sm text-muted-foreground">{t('mcpClientTargetsCard.detailLine')}</p>

      <div className="h-px w-full bg-border" />

      <div className="flex flex-col gap-2.5">
        {targets.map((target) => {
          const name = t(`mcpClientTargetsCard.targets.${target.target}`)
          const mark = TARGET_MARK[target.target]
          const isPending = pendingTarget === target.target

          return (
            <div
              key={target.target}
              role="group"
              aria-label={name}
              className="flex w-full items-center justify-between gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {mark ? (
                  <ProviderMark provider={mark} className="h-[18px] w-[18px] shrink-0" />
                ) : (
                  <AppWindow className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
                )}
                <p className="shrink-0 text-body-lg font-semibold text-foreground">{name}</p>
                {/* The path is shown BEFORE the write, never after: consenting
                    to a file being written means knowing which file it is. */}
                <p className="truncate font-mono text-body-sm text-muted-foreground">{target.configPath}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-body-sm font-semibold',
                    target.connected ? 'border-ok bg-ok-soft text-ok' : 'border-border bg-muted text-muted-foreground'
                  )}
                >
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
                  {t(`mcpClientTargetsCard.state.${target.connected ? 'connected' : 'absent'}`)}
                </div>

                {target.connected ? (
                  <button
                    type="button"
                    onClick={() => onUnregister(target.target)}
                    disabled={isPending}
                    aria-busy={isPending}
                    className={cn(BUTTON_CLASS, interactive)}
                  >
                    <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('mcpClientTargetsCard.buttons.unregister')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRegister(target.target)}
                    // Not installed is as disqualifying as having no token:
                    // writing a config file for a client that is not on this
                    // machine creates a file nothing will ever read.
                    disabled={isPending || !canRegister || !target.detected}
                    aria-busy={isPending}
                    className={cn(BUTTON_CLASS, interactive)}
                  >
                    <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('mcpClientTargetsCard.buttons.register')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* The consent moment, in the same `$warn-soft` strip the permissions card
          uses to disclose what Write really allows. It states BOTH consequences:
          the plaintext token on disk, and that rotating rewrites what it wrote. */}
      <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2">
        <FileKey className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-body-sm font-medium leading-[1.45] text-warn">{t('mcpClientTargetsCard.warning')}</p>
      </div>
    </div>
  )
}
