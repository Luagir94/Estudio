// Container (design D8, node `i1O6R` "Main" / `wWP5i` "Header", frame
// "Grupo — Ajustes"): owns the ONLY data fetching and mutation in this
// domain — probes `cli:status` on mount and re-probes only on demand
// ("Reintentar"), spec "Probe on Open, Manual Retry Only". `ManualPathCard`
// and `ConnectionStatusCard` stay presentational and receive props only.
//
// `refetchOnMount: 'always'` + `staleTime: 0` + the deliberate ABSENCE of
// `refetchInterval` is the whole probe policy — see
// `AjustesContainer.test.tsx` for the RED that guards against someone later
// adding background polling. That policy matters more now than it did with
// one CLI: a background poll would spawn up to six short-lived processes
// every interval instead of two.
//
// The Header's "Reintentar" button and the bottom "Policy Note" (design
// nodes `X2Lzy8` and `L45PvR`) sit OUTSIDE `ConnectionStatusCard` in the
// approved `.pen`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, RefreshCw } from 'lucide-react'
import type { CliProvider, CliProviderStatus } from '../../../shared/ipc/cli'
import { ajustesApi } from '../adapters/ajustesApi'
import { ConnectionStatusCard } from '../components/ConnectionStatusCard'
import { PROVIDER_COMMANDS } from '../domain/connectionDisplay'

const STATUS_QUERY_KEY = ['cli', 'status']

export function AjustesContainer(): React.JSX.Element {
  const queryClient = useQueryClient()

  const { data, refetch } = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: ajustesApi.status,
    refetchOnMount: 'always',
    staleTime: 0
  })

  const overrideMutation = useMutation({
    mutationFn: ({ provider, path }: { provider: CliProvider; path: string | null }) =>
      ajustesApi.setOverride({ provider, path }),
    // Writes the returned DTO straight into the cache (design D8) so the chip
    // reflects the new reality without a manual reload or a second probe
    // round-trip. Only the provider that changed is replaced: the other two
    // were never re-probed, so overwriting them would show stale data as if it
    // were fresh.
    onSuccess: (status) => {
      queryClient.setQueryData<CliProviderStatus[]>(STATUS_QUERY_KEY, (previous) =>
        previous?.map((entry) => (entry.provider === status.provider ? status : entry))
      )
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-display-lg font-bold text-foreground">Ajustes</h1>
          <p className="text-body text-secondary-foreground">
            La app nunca ejecuta nada por su cuenta · todo queda en tu máquina
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-body font-semibold text-foreground transition-colors duration-150 ease-out hover:bg-muted/70 active:bg-muted/50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>

      {/* One card per CLI (approved `.pen`, "Card — Claude Code" et al). The
          manual path is a SECTION inside its own provider's card, not a
          sibling card, so a path field can never be read as belonging to the
          CLI above it. */}
      {data?.map((status) => (
        <ConnectionStatusCard
          key={status.provider}
          status={status}
          onCommitPath={(path) => overrideMutation.mutate({ provider: status.provider, path })}
        />
      ))}

      <div className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">
          Esta pantalla solo detecta los CLI y corre {formatCommands()}, más su página de ayuda para ver qué opciones
          acepta la versión instalada. No envía tus materias, tus adjuntos ni tus notas a ningún lado, y no ejecuta
          ningún otro comando.
        </p>
      </div>
    </div>
  )
}

/** Names every command the probe runs, so the policy note stays literally true. */
function formatCommands(): string {
  const quoted = (Object.keys(PROVIDER_COMMANDS) as CliProvider[]).map(
    (provider) => `\`${PROVIDER_COMMANDS[provider]}\``
  )
  // Spanish joins the final item with "y", not another comma — the approved
  // copy in the `.pen` reads "…, … y …".
  return `${quoted.slice(0, -1).join(', ')} y ${quoted[quoted.length - 1]}`
}
