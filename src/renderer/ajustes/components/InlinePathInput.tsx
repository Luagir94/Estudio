// Presentational (design node "Path Input", frame "Grupo — Ajustes"): the
// manual executable-path override, now a 280px field that sits INSIDE the
// provider's row rather than in a section below it.
//
// It reports a committed value on blur or Enter — there is no save button,
// because validation gates the SPAWN, not the save (design D8/D4). An empty
// value commits `null`, which clears the override and resumes autodetection.
//
// It deliberately does NOT render the execution warning itself: the warning is
// a sibling LINE under the row, not something that can live inside a 280px
// input. Its callers render both from one boolean instead — see
// `ConnectionStatusCard` and `IdleProviderCard`.
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CliProvider } from '../../../shared/ipc/cli'
import { PATH_INPUT_PLACEHOLDER, PROVIDER_LABELS } from '../domain/connectionDisplay'

interface InlinePathInputProps {
  provider: CliProvider
  /** Currently persisted override, or `null` when autodetection is active. */
  overridePath: string | null
  /** Reports the committed value — `null` clears the override (spec "Override Lifecycle"). */
  onCommit: (path: string | null) => void
}

export function InlinePathInput({ provider, overridePath, onCommit }: InlinePathInputProps): React.JSX.Element {
  const { t } = useTranslation('ajustes')
  const [value, setValue] = useState(overridePath ?? '')

  // Re-syncs only when the persisted override moves from OUTSIDE this
  // component (e.g. the mutation wrote a new one), never on every keystroke.
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
    <input
      type="text"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      placeholder={PATH_INPUT_PLACEHOLDER}
      // The visible row names the CLI, but a screen reader reading controls out
      // of context would meet three identical path fields, so the accessible
      // name carries the CLI itself.
      aria-label={t('inlinePathInput.ariaLabel', { provider: PROVIDER_LABELS[provider] })}
      className="w-[280px] rounded-lg border border-border bg-background px-3 py-2 text-body text-foreground placeholder:text-muted-foreground"
    />
  )
}
