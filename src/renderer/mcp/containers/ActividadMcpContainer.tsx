// Container (design node `OZBa5` "Screen — Actividad MCP", mcp-app-control
// task 18.2): the FIRST real caller of `mcpActivityApi` (PR17 shipped it with
// no caller yet). Owns the TanStack Query read and the push subscription;
// `McpActivityList` stays presentational, same container/presentational
// split every other screen follows.
//
// Reached ONLY from the Ajustes Permisos card's "Ver actividad" button
// (task 18.4) — this route is deliberately NOT a Sidebar item, so `onBack`
// is this screen's only way back, wired by `router.tsx`'s own screen wrapper
// (`useHistoryBack`) the same way `SubjectDetailScreen` wires its own.
//
// The refetch is PUSH-DRIVEN, not polled: `mcp:activity-changed` fires on
// every audit insert (design D9), and this screen just invalidates its own
// cache entry when it hears one. The subscription's returned unsubscribe
// MUST run on unmount — same contract `AttachmentViewerContainer`'s
// `indexadoApi.onStatusChanged` subscription already documents — or a screen
// that mounts and unmounts repeatedly stacks a listener per visit, a leak
// that degrades quietly rather than failing a test.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, ChevronLeft, History, Info } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { mcpActivityApi, MCP_ACTIVITY_QUERY_KEY } from '../adapters/mcpActivityApi'
import { McpActivityList } from '../components/McpActivityList'
import { Button } from '../../shared/components/ui/button'

interface ActividadMcpContainerProps {
  onBack: () => void
}

export function ActividadMcpContainer({ onBack }: ActividadMcpContainerProps): React.JSX.Element {
  const { t } = useTranslation('mcp')
  const queryClient = useQueryClient()

  const { data: entries } = useQuery({
    queryKey: MCP_ACTIVITY_QUERY_KEY,
    queryFn: () => mcpActivityApi.listActivity()
  })

  useEffect(() => {
    return mcpActivityApi.onActivityChanged(() => {
      void queryClient.invalidateQueries({ queryKey: MCP_ACTIVITY_QUERY_KEY })
    })
  }, [queryClient])

  const rows = entries ?? []

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="compact" onClick={onBack} className="w-fit gap-2 px-0 text-secondary-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {t('mcpActivityScreen.backToAjustes')}
      </Button>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">{t('mcpActivityScreen.title')}</h1>
        <p className="text-body text-secondary-foreground">{t('mcpActivityScreen.subtitle')}</p>
      </div>

      <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <h3 className="text-body-lg font-semibold text-foreground">{t('mcpActivityScreen.card.title')}</h3>
              <p className="text-body-sm text-secondary-foreground">{t('mcpActivityScreen.card.description')}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-muted px-1 py-1">
            <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold text-foreground">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {t('mcpActivityScreen.card.count', { count: rows.length })}
            </div>
          </div>
        </div>

        <McpActivityList entries={rows} />

        <div className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-body-sm text-secondary-foreground">{t('mcpActivityScreen.footerNote')}</p>
        </div>
      </div>
    </div>
  )
}
