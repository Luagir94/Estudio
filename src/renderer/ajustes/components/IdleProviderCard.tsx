// Presentational (approved `.pen`, row "CLI Row — Antigravity CLI" inside
// "Card — CLIs detectados"): the state a provider row is in when the screen
// opens — nothing probed, because connecting a CLI is opt-in.
//
// A ROW, not a card. It carries no border and no surface of its own since the
// redesign: the three providers share one card, and three nested cards inside
// it would draw a box around every line of a list.
//
// ONE ROW: mark, name, the optional path field, and the button that starts the
// probe. It makes NO claim about the CLI — not that it is installed, not that
// it is missing. `not-found` is a RESULT; this is the absence of one, and
// reporting the first when the second is true would announce a failed search
// nobody ran.
//
// The path field is offered BEFORE the first probe on purpose: a student who
// already knows their install is outside the PATH would otherwise have to
// connect, watch it fail, and only then be shown where to type the fix.
import { Plug } from 'lucide-react'
import { useState } from 'react'
import type { CliProvider } from '../../../shared/ipc/cli'
import { CONNECT_ACTION, PROVIDER_LABELS } from '../domain/connectionDisplay'
import { InlinePathInput } from './InlinePathInput'
import { ProviderMark } from './ProviderMark'

interface IdleProviderCardProps {
  provider: CliProvider
  /**
   * The path already SAVED for this CLI, or `null` for autodetection.
   *
   * A returning student can have one without being connected — disconnecting
   * keeps the path on purpose — and a row that showed an empty field there
   * would hide the very path the next probe is about to use.
   */
  overridePath: string | null
  /**
   * Starts this provider's first probe — the only thing on this row that
   * spawns a process. Carries the field's value, or `null` to autodetect.
   */
  onConnect: (path: string | null) => void
}

export function IdleProviderCard({ provider, overridePath, onConnect }: IdleProviderCardProps): React.JSX.Element {
  // Seeded from what is saved, then held here rather than committed on blur:
  // nothing is persisted until the user presses Conectar, so a half-typed path
  // never becomes a saved override.
  const [path, setPath] = useState<string | null>(overridePath)

  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <ProviderMark provider={provider} className="h-[18px] w-[18px] text-secondary-foreground" />
        <h4 className="text-body-lg font-semibold text-foreground">{PROVIDER_LABELS[provider]}</h4>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <InlinePathInput provider={provider} overridePath={overridePath} onCommit={setPath} />
        {/* The accessible name carries the CLI: three identical "Conectar"
            buttons on one screen are indistinguishable to anyone navigating
            by control. */}
        <button
          type="button"
          onClick={() => onConnect(path)}
          aria-label={`${CONNECT_ACTION} ${PROVIDER_LABELS[provider]}`}
          className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-body-sm font-semibold text-foreground transition-colors duration-150 ease-out hover:bg-muted/70 active:bg-muted/50"
        >
          <Plug className="h-3.5 w-3.5 text-secondary-foreground" aria-hidden="true" />
          {CONNECT_ACTION}
        </button>
      </div>
    </div>
  )
}
