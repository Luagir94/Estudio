// Presentational (design node "Execution Warning", frame "Grupo — Ajustes"):
// the trust-boundary control of design D9, spec "Manual Path Override Field
// with Execution Warning".
//
// It is the SOLE user-facing compensating control for a boundary that admits
// no allowlist: the app spawns whatever the path field points at. It therefore
// takes no `status`, no `overridePath` and no focus flag — there is nothing it
// could be gated on, because a caller that renders the field must render this.
//
// The rule it enforces lives in the callers and is tested there: wherever a
// path field appears, this appears with it. `ConnectionStatusCard` and
// `IdleProviderCard` each drive both from ONE boolean, so the two cannot drift
// apart.
import { TriangleAlert } from 'lucide-react'
import type { CliProvider } from '../../../shared/ipc/cli'
import { executionWarningCopy } from '../domain/connectionDisplay'

interface ExecutionWarningProps {
  provider: CliProvider
}

export function ExecutionWarning({ provider }: ExecutionWarningProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
      <p className="text-body-sm font-medium leading-[1.45] text-warn">{executionWarningCopy(provider)}</p>
    </div>
  )
}
