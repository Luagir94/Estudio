import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ModelSelection } from '../../../shared/ipc/cli'
import { ASK_MODEL_LABEL, ASK_RECOMMENDED_LABEL } from '../domain/askDisplay'
import type { ModelGroup } from '../domain/modelCatalog'

interface AskModelPickerProps {
  value: ModelSelection
  /** One section per CLI that has something to offer, already ordered. */
  groups: readonly ModelGroup[]
  disabled: boolean
  onChange: (selection: ModelSelection) => void
}

/**
 * Model choice (design `Screen — Preguntar · Modelo`, node `U5cyU`). It sits in
 * the panel rather than in Ajustes on purpose: the cost disclaimer is two rows
 * below it, so the quality/cost trade-off is visible at the moment the user
 * spends.
 *
 * The menu is BUILT from what the installed CLIs turned out to have, not from
 * a list this app's authors wrote down. None of the CLIs can be asked — there
 * is no `models` subcommand on `claude` or on `codex`, and typing one is read
 * as a prompt that spends the student's own usage — so the app reads the state
 * each CLI already wrote for itself and offers what it finds.
 *
 * Three things follow from that, and each is load-bearing:
 *
 * GROUPED BY CLI, because the list now mixes two programs spending two
 * different accounts. The heading carries the provenance so the rows do not
 * have to repeat it, which is what keeps nine models scannable.
 *
 * BOUNDED HEIGHT, because the list grows with whatever the CLIs report. The
 * `max-h` is the whole reason the menu cannot push past the panel it belongs
 * to; without it the panel overflowed with no way to reach the rows below.
 *
 * NO FREE-TEXT FIELD. There used to be one, for the era when the app could
 * only guess at the account's models. Discovery replaced the guess, and a
 * typed id is now a worse path than the list: it fails at spawn time, far from
 * where it was typed. `ASK_BASELINE_MODELS` is what guarantees the list is
 * never empty enough to need an escape hatch.
 */
export function AskModelPicker({ value, groups, disabled, onChange }: AskModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const selected = groups
    .flatMap((group) => group.options)
    .find((option) => option.provider === value.provider && option.modelId === value.modelId)
  // A stored selection whose model is no longer offered still has to render as
  // what will actually run, so the button falls back to the id rather than to
  // a name that is not it.
  const buttonLabel = selected?.name ?? value.modelId

  return (
    <div className="relative flex items-center gap-2 px-4 py-2">
      <span className="text-label text-muted-foreground">{ASK_MODEL_LABEL}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 text-label font-semibold text-ink-secondary disabled:opacity-50"
      >
        {buttonLabel}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute top-full left-16 z-10 w-[248px] overflow-hidden rounded-lg border border-border bg-card shadow-[0_8px_24px_#00000080]">
          {/* The scroll region. Bounded here and nowhere else, so the menu's
              height is a property of the menu rather than of how many models
              the student's account happens to have. */}
          <div
            role="listbox"
            aria-label={ASK_MODEL_LABEL}
            className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto p-1"
          >
            {groups.map((group) => (
              <div key={group.provider} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
                <span className="px-2.5 pt-2 pb-1 text-overline text-muted-foreground uppercase">{group.label}</span>

                {group.options.map((option) => {
                  const isSelected = option.provider === value.provider && option.modelId === value.modelId
                  return (
                    <button
                      key={option.modelId}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange({ provider: option.provider, modelId: option.modelId })
                        setOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] text-left ${
                        isSelected ? 'bg-brand-soft' : ''
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                          className={`text-body-sm font-semibold ${isSelected ? 'text-primary-ink' : 'text-foreground'}`}
                        >
                          {option.name}
                        </span>
                        {option.recommended && (
                          <span className="rounded bg-secondary px-[5px] py-0.5 text-overline font-semibold text-ink-secondary">
                            {ASK_RECOMMENDED_LABEL}
                          </span>
                        )}
                      </span>
                      {isSelected && <Check className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
