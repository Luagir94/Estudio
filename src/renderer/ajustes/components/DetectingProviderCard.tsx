// Presentational: the row a provider occupies while its FIRST probe is still
// running. Same row chrome as `ConnectionStatusCard` and `IdleProviderCard`
// (frame "Grupo — Ajustes") so the layout does not jump as a row moves
// idle → detecting → answered.
//
// It is a SEPARATE component on purpose. `ConnectionStatusCard` renders a
// `CliProviderStatus` and nothing else; teaching it to also render the absence
// of one would mean every row inside it growing a "if we don't know yet"
// branch, and the first such branch to be forgotten would print a confident
// value for something nobody has looked up.
//
// It deliberately makes NO claim: no version, no executable, no origin, no
// capability rows, and no path field — offering one mid-probe would invite an
// edit that the answer already in flight is about to contradict. The one thing
// it knows is which CLI it is waiting on.
import { Loader } from 'lucide-react'
import type { CliProvider } from '../../../shared/ipc/cli'
import { DETECTING_LABEL, PROVIDER_LABELS } from '../domain/connectionDisplay'
import { ProviderMark } from './ProviderMark'

interface DetectingProviderCardProps {
  provider: CliProvider
}

export function DetectingProviderCard({ provider }: DetectingProviderCardProps): React.JSX.Element {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {/* The mark is drawn even while detecting: WHICH CLI a row is about is
            known before its probe answers — only its state is not. */}
        <ProviderMark provider={provider} className="h-[18px] w-[18px] text-secondary-foreground" />
        <h4 className="text-body-lg font-semibold text-foreground">{PROVIDER_LABELS[provider]}</h4>
      </div>

      {/* `role="status"` for the same reason `AskStateCard` uses it: a spinner
          alone announces nothing to a screen reader. */}
      <span
        role="status"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-muted-foreground"
      >
        <Loader className="h-3 w-3 animate-spin" aria-hidden="true" />
        {DETECTING_LABEL}
      </span>
    </div>
  )
}
