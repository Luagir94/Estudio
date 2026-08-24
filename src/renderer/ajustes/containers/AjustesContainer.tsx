// Container (design D8, node `i1O6R` "Main" / `wWP5i` "Header", frame
// "Grupo — Ajustes"): owns the ONLY data fetching and mutation in this
// domain. `IdleProviderCard`, `DetectingProviderCard` and
// `ConnectionStatusCard` stay presentational and receive props only.
//
// CONNECTING A CLI IS OPT-IN, and this file is where that is enforced. A
// provider query is `enabled` only when the student has already opted in to
// that CLI; every other one starts disabled and stays that way until its own
// button is pressed. There is no `refetchInterval` and no eager `refetch()`.
//
// The screen used to probe all three CLIs on mount, which meant opening
// Ajustes spawned up to six short-lived processes for tools the student may
// never have installed. Each row now owns its own probe and its own button:
// connecting Claude must not start a Codex process, and re-checking one must
// not re-check the other two.
//
// RE-PROBING A CONNECTED CLI ON OPEN IS NOT A RELAPSE INTO THAT. The opt-in
// list is a decision the student already made and this app persisted; honoring
// it is the opposite of deciding for them. Re-asking every launch was the bug.
// What must never happen — and does not — is a spawn for a CLI that is not on
// that list.
//
// One query PER PROVIDER rather than one for the screen. A shared entry could
// not hold three independent answers — connecting one CLI would have forced
// invented values for the two nobody touched.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CLI_PROVIDERS, type CliPreference, type CliProvider } from '../../../shared/ipc/cli'
import { ajustesApi, CLI_PREFERENCES_QUERY_KEY, cliStatusQueryKey } from '../adapters/ajustesApi'
import { ConnectionStatusCard } from '../components/ConnectionStatusCard'
import { DetectingProviderCard } from '../components/DetectingProviderCard'
import { IdleProviderCard } from '../components/IdleProviderCard'
import { PROVIDER_COMMANDS } from '../domain/connectionDisplay'

export function AjustesContainer(): React.JSX.Element {
  const { t } = useTranslation('ajustes')
  const queryClient = useQueryClient()

  // A settings read, not a probe: it starts no process, which is the only
  // reason it may run on mount at all. It answers both questions this screen
  // has before it may spawn anything — may I probe this CLI, and which path
  // has the student already pointed it at.
  const { data: preferences } = useQuery({
    queryKey: CLI_PREFERENCES_QUERY_KEY,
    queryFn: ajustesApi.preferences
  })

  const preferenceFor = (provider: CliProvider): CliPreference | undefined =>
    preferences?.find((entry) => entry.provider === provider)

  // `useQueries` rather than a query per child component: the container/
  // presentational split in this domain says fetching lives HERE, and the
  // provider list is static, so one hook covers all three without a second
  // data-fetching component.
  const probes = useQueries({
    queries: CLI_PROVIDERS.map((provider) => ({
      queryKey: cliStatusQueryKey(provider),
      queryFn: () => ajustesApi.probe({ provider }),
      // THE gate. `preferences` is undefined until the settings read answers,
      // so this is false on the very first render too — nothing can spawn in
      // the window before the app knows what the student opted in to.
      enabled: preferences?.some((entry) => entry.provider === provider && entry.connected) ?? false,
      staleTime: 0
    }))
  })

  const overrideMutation = useMutation({
    mutationFn: ({ provider, path }: { provider: CliProvider; path: string | null }) =>
      ajustesApi.setOverride({ provider, path }),
    // Writes the returned DTO straight into that provider's own cache entry
    // (design D8) so the chip reflects the new reality without a manual reload
    // or a second probe round-trip. Only the provider that changed is touched.
    onSuccess: (status) => {
      queryClient.setQueryData(cliStatusQueryKey(status.provider), status)
      // Committing a path connects the CLI on the main side, so the opt-in list
      // this screen is reading has just gone stale.
      void queryClient.invalidateQueries({ queryKey: CLI_PREFERENCES_QUERY_KEY })
    }
  })

  const disconnectMutation = useMutation({
    mutationFn: (provider: CliProvider) => ajustesApi.disconnect({ provider }),
    onSuccess: (_result, provider) => {
      // The row must go back to idle, which means FORGETTING the last status
      // rather than keeping it around greyed out. A status is something the app
      // observed under a permission that no longer exists.
      queryClient.removeQueries({ queryKey: cliStatusQueryKey(provider) })
      void queryClient.invalidateQueries({ queryKey: CLI_PREFERENCES_QUERY_KEY })
    }
  })

  return (
    <div className="flex flex-col gap-6">
      {/* The header lost its "Reintentar" (design node `X2Lzy8`, removed):
          one button that re-probed every CLI is exactly the fan-out this
          screen no longer does. Retrying is per row now. */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-display-lg font-bold text-foreground">{t('ajustesContainer.title')}</h1>
        <p className="text-body text-secondary-foreground">{t('ajustesContainer.subtitle')}</p>
      </div>

      {/* One row per CLI (approved `.pen`), in one of three honest states:
            idle      — not connected, so nothing is claimed;
            detecting — this row's probe is running for the FIRST time;
            answered  — the main process observed something.
          A re-probe stays in the answered state on purpose: the previous
          values are still the last thing actually observed, and the busy
          chip is what says work is in flight. */}
      {CLI_PROVIDERS.map((provider, index) => {
        const probe = probes[index]

        if (probe.data) {
          return (
            <ConnectionStatusCard
              key={provider}
              status={probe.data}
              isReprobing={probe.isFetching}
              onReprobe={() => void probe.refetch()}
              onDisconnect={() => disconnectMutation.mutate(provider)}
              onCommitPath={(path) => overrideMutation.mutate({ provider, path })}
            />
          )
        }

        // Work in flight is work in flight, whichever hook is carrying it. A
        // first connect runs through the MUTATION (it commits the field before
        // probing), so reading only the query's `isFetching` would leave the
        // pressed row sitting there looking untouched while a process boots.
        const connecting =
          probe.isFetching || (overrideMutation.isPending && overrideMutation.variables?.provider === provider)

        return connecting ? (
          <DetectingProviderCard key={provider} provider={provider} />
        ) : (
          <IdleProviderCard
            key={provider}
            provider={provider}
            // Pressing Conectar always COMMITS the field, whatever is in it.
            // One route for both cases, because clearing a saved path is a
            // statement too: an empty field means "autodetect on the PATH", and
            // a branch that only wrote non-empty values would leave the row
            // showing empty while a saved path stayed in force.
            //
            // `setOverride` writes the path, records the opt-in and probes, all
            // in one — which is also why nothing here has to sequence the probe
            // against the preferences re-read.
            overridePath={preferenceFor(provider)?.overridePath ?? null}
            onConnect={(path) => overrideMutation.mutate({ provider, path })}
          />
        )
      })}

      <div className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">
          {t('ajustesContainer.policyNote', { commands: formatCommands(t) })}
        </p>
      </div>
    </div>
  )
}

/** Names every command a probe can run, so the policy note stays literally true. */
function formatCommands(t: TFunction): string {
  const quoted = (Object.keys(PROVIDER_COMMANDS) as CliProvider[]).map(
    (provider) => `\`${PROVIDER_COMMANDS[provider]}\``
  )
  // Spanish joins the final item with "y", not another comma — the approved
  // copy in the `.pen` reads "…, … y …".
  return `${quoted.slice(0, -1).join(', ')} ${t('ajustesContainer.commandsJoiner')} ${quoted[quoted.length - 1]}`
}
