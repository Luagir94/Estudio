// Presentational (design node `ROdpH` "Card — Ruta manual", frame "Grupo —
// Ajustes"): the manual executable-path override field plus its execution
// warning (design D9, spec "Manual Path Override Field with Execution
// Warning") — the sole user-facing compensating control for a trust
// boundary that admits no allowlist (the app spawns whatever this field
// points at). The warning block below has NO conditional around it at all
// — no status, override-presence or focus guard exists in this file, on
// purpose (see `ManualPathCard.test.tsx`, "renders unconditionally").
//
// No container, no react-query, no IPC here (PR7 owns that) — this
// component only reports the user's committed intent through `onCommit`.
import { FolderCog, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { Input } from '../../shared/components/ui/input'
import type { CliProvider } from '../../../shared/ipc/cli'
import { executionWarningCopy, MANUAL_PATH_TITLE, PROVIDER_LABELS } from '../domain/connectionDisplay'

interface ManualPathCardProps {
  /** Which CLI this card overrides — one card per provider. */
  provider: CliProvider
  /** Currently persisted override, or `null` when autodetection is active. */
  overridePath: string | null
  /**
   * Reports the user's committed value — `null` clears the override (spec
   * "Override Lifecycle"). Fires on blur or Enter; there is no save button
   * because validation gates the SPAWN, not the save (design D8/D4).
   */
  onCommit: (path: string | null) => void
}

/** Placeholder shaped like the real shim each CLI ships on Windows. */
const PATH_PLACEHOLDERS: Record<CliProvider, string> = {
  claude: 'C:\\ruta\\a\\claude.cmd',
  gemini: 'C:\\ruta\\a\\gemini.cmd',
  codex: 'C:\\ruta\\a\\codex.cmd'
}

export function ManualPathCard({ provider, overridePath, onCommit }: ManualPathCardProps): React.JSX.Element {
  const [value, setValue] = useState(overridePath ?? '')

  // Re-sync the field only when the persisted override changes from OUTSIDE
  // this component (e.g. once PR7's mutation reflects a new value) — never
  // on every keystroke, only when the prop itself moves.
  useEffect(() => {
    setValue(overridePath ?? '')
  }, [overridePath])

  function commit(): void {
    const trimmed = value.trim()
    onCommit(trimmed === '' ? null : trimmed)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    // No card chrome of its own: the approved `.pen` folds this into the
    // provider's card as a section under a divider, so a border and background
    // here would draw a card inside a card.
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderCog className="h-[18px] w-[18px] text-secondary-foreground" aria-hidden="true" />
          {/* The card already names the CLI, so repeating it here is noise. */}
          <h3 className="text-body-lg font-semibold text-foreground">{MANUAL_PATH_TITLE}</h3>
        </div>
        <span className="rounded-lg border border-border bg-muted px-2.5 py-1.5 text-label font-semibold text-muted-foreground">
          Avanzado
        </span>
      </div>

      <Input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={PATH_PLACEHOLDERS[provider]}
        // The heading dropped the CLI name, but the accessible name keeps it:
        // three sections titled "Ruta manual" on one screen are ambiguous to a
        // screen reader, which has no card boundary to read them against.
        aria-label={`Ruta manual del ejecutable de ${PROVIDER_LABELS[provider]}`}
        className="bg-muted text-body"
      />

      <p className="text-body-sm text-muted-foreground">
        Vacío = detección automática. Solo se usa si el archivo existe y es ejecutable.
      </p>

      <div className="flex items-start gap-2 rounded-lg bg-warn-soft px-4 py-3">
        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-body-sm font-medium leading-[1.45] text-warn">{executionWarningCopy(provider)}</p>
      </div>
    </div>
  )
}
