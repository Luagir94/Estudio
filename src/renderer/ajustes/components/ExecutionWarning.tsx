// Presentational (approved `.pen`, node `xKqpC` "Execution Warning" inside
// "Card — CLIs detectados"): the trust-boundary control of design D9, spec
// "Manual Path Override Field with Execution Warning".
//
// It is the SOLE user-facing compensating control for a boundary that admits
// no allowlist: the app spawns whatever a path field points at. It takes no
// props at all — not a status, not an override, not a focus flag, and since
// the redesign not a provider either. There is nothing it could be gated on,
// because the card that owns the path fields owns this too, once, for all of
// them.
//
// It used to be per-row, which meant three identical warnings stacked in one
// viewport, each naming a different vendor. Repeating a warning three times
// does not make it three times louder — it makes it furniture. One card, one
// warning, at the foot of the rows it covers.
import { TriangleAlert } from 'lucide-react'
import { EXECUTION_WARNING } from '../domain/connectionDisplay'

export function ExecutionWarning(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
      <p className="text-body-sm font-medium leading-[1.45] text-warn">{EXECUTION_WARNING}</p>
    </div>
  )
}
