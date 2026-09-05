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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CLI_PROVIDERS, type CliPreference, type CliProvider } from '../../../shared/ipc/cli'
import type { ListMcpClientTargetsResult, McpStatusResult } from '../../../shared/ipc/mcp'
import type { Palette, ThemePreference } from '../../../shared/ipc/theme'
import { mcpApi, MCP_CLIENT_TARGETS_QUERY_KEY, MCP_STATUS_QUERY_KEY } from '../../mcp/adapters/mcpApi'
import { applyPalette } from '../../shared/lib/applyPalette'
import {
  ajustesApi,
  CLI_PREFERENCES_QUERY_KEY,
  cliStatusQueryKey,
  PALETTE_QUERY_KEY,
  THEME_PREFERENCE_QUERY_KEY
} from '../adapters/ajustesApi'
import { AjustesSectionTabs } from '../components/AjustesSectionTabs'
import { AppearanceCard } from '../components/AppearanceCard'
import { CliProvidersCard } from '../components/CliProvidersCard'
import { ConnectionStatusCard } from '../components/ConnectionStatusCard'
import { DetectingProviderCard } from '../components/DetectingProviderCard'
import { IdleProviderCard } from '../components/IdleProviderCard'
import { McpClientTargetsCard } from '../components/McpClientTargetsCard'
import { McpPermissionsCard } from '../components/McpPermissionsCard'
import { McpTokenCard } from '../components/McpTokenCard'
import { DEFAULT_AJUSTES_SECTION, type AjustesSection } from '../domain/ajustesSections'
import { PROVIDER_COMMANDS } from '../domain/connectionDisplay'

interface AjustesContainerProps {
  /**
   * Navigates to `/mcp/actividad` (mcp-app-control task 18.4). Optional and
   * defaulted to a no-op so this container stays constructible with no
   * props, as every existing test here already does — the router's own
   * `AjustesScreen` wrapper is the one caller that supplies a real one.
   */
  onViewMcpActivity?: () => void
}

export function AjustesContainer({ onViewMcpActivity = () => {} }: AjustesContainerProps = {}): React.JSX.Element {
  const { t } = useTranslation('ajustes')
  const queryClient = useQueryClient()

  // Which of the three sections is on screen (approved `.pen`, node `PQXon`).
  //
  // It gates RENDERING ONLY — never a query. The probe gate stays exactly
  // where it was, on the persisted opt-in list below: tying a spawn to which
  // tab is open would mean a CLI the student connected gets re-probed every
  // time they wander through this section, and one they never opted in to
  // would still be safe for the wrong reason.
  const [section, setSection] = useState<AjustesSection>(DEFAULT_AJUSTES_SECTION)

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

  // Another settings read — it starts no process either. `undefined` until the
  // read answers, and the card waits for it: painting the default meanwhile
  // would show 'Sistema' pressed to a student who chose something else.
  const { data: themePreference } = useQuery({
    queryKey: THEME_PREFERENCE_QUERY_KEY,
    queryFn: ajustesApi.themePreference
  })

  const themeMutation = useMutation({
    mutationFn: (preference: ThemePreference) => ajustesApi.setThemePreference({ preference }),
    // Same write-the-echo pattern as `overrideMutation` below: the handler
    // already returned the persisted value, so it goes straight into the cache
    // instead of costing a second settings read.
    onSuccess: (preference) => {
      queryClient.setQueryData(THEME_PREFERENCE_QUERY_KEY, preference)
    }
  })

  // The palette's own entry, read on mount like the preference above and for
  // the same reason: it starts no process. `main.tsx` already applied the
  // stored palette before the first paint, so this read is not what puts it on
  // screen — it is what lets the select show the right option instead of
  // guessing the default.
  const { data: palette } = useQuery({
    queryKey: PALETTE_QUERY_KEY,
    queryFn: ajustesApi.palette
  })

  const paletteMutation = useMutation({
    mutationFn: (next: Palette) => ajustesApi.setPalette({ palette: next }),
    onSuccess: (next) => {
      // APPLY, then cache. The main process persists a palette but applies
      // nothing — unlike the theme preference, which `nativeTheme.themeSource`
      // puts into effect on the way through. So the repaint is this line, and
      // it deliberately happens only after the write came back: a palette on
      // screen that failed to persist would be a lie the next launch corrects.
      applyPalette(next)
      queryClient.setQueryData(PALETTE_QUERY_KEY, next)
    }
  })

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

  // A settings read like the others above, but of a live server, not a saved
  // preference — it starts no process either way.
  const { data: mcpStatus } = useQuery({ queryKey: MCP_STATUS_QUERY_KEY, queryFn: mcpApi.status })

  // `mcp:issueToken` returns the plaintext token EXACTLY once (design D7) —
  // `mcp:status` has no field that could carry it back. This is the only
  // place it is ever held, and only for this session: a reload of this
  // screen (or of the app) loses it, by design, not by bug.
  const [issuedMcpToken, setIssuedMcpToken] = useState<string | null>(null)

  // Read from the client's own config FILE, not from anything this app
  // persists, so a user who edited it by hand sees the truth rather than our
  // memory of it. Separate query key from `mcp:status`: a write here changes
  // no token and no grant.
  const { data: mcpClientTargets } = useQuery({
    queryKey: MCP_CLIENT_TARGETS_QUERY_KEY,
    queryFn: mcpApi.listClientTargets
  })

  const mcpRegisterMutation = useMutation({
    mutationFn: mcpApi.writeClientConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MCP_CLIENT_TARGETS_QUERY_KEY })
    }
  })

  const mcpUnregisterMutation = useMutation({
    mutationFn: mcpApi.removeClientConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MCP_CLIENT_TARGETS_QUERY_KEY })
    }
  })

  /** The targets this app has actually written itself into, per the last read of their files. */
  const connectedMcpTargets = (): ListMcpClientTargetsResult =>
    (queryClient.getQueryData<ListMcpClientTargetsResult>(MCP_CLIENT_TARGETS_QUERY_KEY) ?? []).filter(
      (target) => target.connected
    )

  const mcpRotateMutation = useMutation({
    mutationFn: mcpApi.issueToken,
    onSuccess: (result) => {
      setIssuedMcpToken(result.token)
      // Listener/permissions may also have changed by reconcile (issuing the
      // FIRST token starts the listener once a slice is granted) — a full
      // re-read is simpler and safer here than hand-patching individual
      // fields the card does not otherwise touch.
      void queryClient.invalidateQueries({ queryKey: MCP_STATUS_QUERY_KEY })
      // A rotation invalidates the token every registered client is holding.
      // Rewriting them is not a convenience: a client left on the old token
      // simply stops listing tools, with nothing on screen to say why — the
      // one failure mode this whole feature exists to avoid creating.
      for (const target of connectedMcpTargets()) {
        mcpRegisterMutation.mutate({ target: target.target, token: result.token })
      }
    }
  })

  const mcpRevokeMutation = useMutation({
    mutationFn: mcpApi.revokeToken,
    onSuccess: () => {
      setIssuedMcpToken(null)
      void queryClient.invalidateQueries({ queryKey: MCP_STATUS_QUERY_KEY })
      // Same obligation in the other direction: a revoked token must not leave
      // a dead server behind for the user to clean up by hand.
      for (const target of connectedMcpTargets()) {
        mcpUnregisterMutation.mutate({ target: target.target })
      }
    }
  })

  // Writes the returned grant straight into that ONE slice's own cache entry
  // (same pattern `overrideMutation` above uses for a CLI provider status),
  // rather than re-reading the whole `mcp:status` payload for a single
  // toggle flip.
  const mcpSetPermissionMutation = useMutation({
    mutationFn: mcpApi.setPermission,
    onSuccess: (updatedPermission) => {
      queryClient.setQueryData(MCP_STATUS_QUERY_KEY, (previous: McpStatusResult | undefined) => {
        if (!previous) {
          return previous
        }
        // Upsert, not a plain map: the contract guarantees one entry per
        // slice, but nothing here should assume it — a slice this cache
        // never saw yet must still land on the FIRST grant it receives.
        const wasPresent = previous.permissions.some((permission) => permission.slice === updatedPermission.slice)
        const permissions = wasPresent
          ? previous.permissions.map((permission) =>
              permission.slice === updatedPermission.slice ? updatedPermission : permission
            )
          : [...previous.permissions, updatedPermission]
        return { ...previous, permissions }
      })
    }
  })

  return (
    <div className="flex flex-col gap-6">
      {/* The header lost its "Reintentar" (design node `X2Lzy8`, removed):
          one button that re-probed every CLI is exactly the fan-out this
          screen no longer does. Retrying is per row now.

          It gained the section tabs (node `PQXon`) on the right. This screen
          was ONE column 1618px tall — two full viewports of stacked cards,
          mixing appearance with CLI connections with MCP grants. The tabs are
          what cut it into three sections that each fit a viewport. The title
          and the tabs are the only things every section shares. */}
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-display-lg font-bold text-foreground">{t('ajustesContainer.title')}</h1>
          <p className="text-body text-secondary-foreground">{t('ajustesContainer.subtitle')}</p>
        </div>

        <AjustesSectionTabs value={section} onChange={setSection} />
      </div>

      {/* The whole of section one (approved `.pen`, screen "Ajustes ·
          Apariencia"). Rendered only once BOTH persisted values have answered
          — the same no-claims-before-the-read rule the provider rows follow.
          Waiting on both rather than rendering each row as it arrives keeps
          the card from changing height under the cursor on every open. */}
      {section === 'apariencia' && themePreference && palette && (
        <AppearanceCard
          value={themePreference}
          onChange={(preference) => themeMutation.mutate(preference)}
          palette={palette}
          onPaletteChange={(next) => paletteMutation.mutate(next)}
        />
      )}

      {/* Section two (approved `.pen`, screen "Ajustes · Integraciones"):
          everything about a process outside this app — which CLIs are
          connected, the MCP token, and which clients hold it. The policy note
          closes it because it is that section's disclosure, not the screen's:
          it describes what detecting a CLI executes. */}
      {section === 'integraciones' && (
        <>
          {/* ONE card, one row per CLI (approved `.pen`, "Card — CLIs
              detectados"). Each row is in one of three honest states:
                idle      — not connected, so nothing is claimed;
                detecting — this row's probe is running for the FIRST time;
                answered  — the main process observed something.
              A re-probe stays in the answered state on purpose: the previous
              values are still the last thing actually observed, and the busy
              chip is what says work is in flight.

              The count in the head is derived from the SAME probe results the
              rows render, so the head cannot claim a connection no row shows. */}
          <CliProvidersCard
            connectedCount={probes.filter((probe) => probe.data?.status === 'connected').length}
            totalCount={CLI_PROVIDERS.length}
          >
            {CLI_PROVIDERS.map((provider, index) => {
              // useQueries maps over the same CLI_PROVIDERS list, so the row exists.
              const probe = probes[index]!

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
          </CliProvidersCard>

          {/* Approved `.pen` ordering: after the last CLI card, before the
          policy note. Rendered only once the status read answers — same
          no-claims-before-the-read rule as `AppearanceCard` above. */}
          {mcpStatus && (
            <>
              <McpTokenCard
                status={mcpStatus}
                issuedToken={issuedMcpToken}
                onRotate={() => mcpRotateMutation.mutate()}
                onRevoke={() => mcpRevokeMutation.mutate()}
                isRotating={mcpRotateMutation.isPending}
                isRevoking={mcpRevokeMutation.isPending}
              />
              <McpClientTargetsCard
                targets={mcpClientTargets ?? []}
                // The SAME gate the copy button uses: no plaintext this session,
                // nothing to write.
                canRegister={issuedMcpToken !== null}
                onRegister={(target) => mcpRegisterMutation.mutate({ target, token: issuedMcpToken ?? '' })}
                onUnregister={(target) => mcpUnregisterMutation.mutate({ target })}
                pendingTarget={
                  mcpRegisterMutation.isPending
                    ? (mcpRegisterMutation.variables?.target ?? null)
                    : mcpUnregisterMutation.isPending
                      ? (mcpUnregisterMutation.variables?.target ?? null)
                      : null
                }
              />
            </>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-body-sm text-muted-foreground">
              {t('ajustesContainer.policyNote', { commands: formatCommands(t) })}
            </p>
          </div>
        </>
      )}

      {/* Section three (approved `.pen`, screen "Ajustes · Permisos"): the
          eight grants, alone. It is LAST in the tab order and alone on its
          section for the same reason — this is the only page in the app that
          hands another process write access to the student's records, and it
          should never share a scroll with a colour picker. */}
      {section === 'permisos' && mcpStatus && (
        <McpPermissionsCard
          permissions={mcpStatus.permissions}
          onChangePermission={(input) => mcpSetPermissionMutation.mutate(input)}
          pendingSlice={mcpSetPermissionMutation.isPending ? (mcpSetPermissionMutation.variables?.slice ?? null) : null}
          onViewActivity={onViewMcpActivity}
        />
      )}
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
