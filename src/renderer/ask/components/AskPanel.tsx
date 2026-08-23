import { ArrowUp, CircleStop, History, MessageCircle, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ModelSelection } from '../../../shared/ipc/cli'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost } from '../../shared/lib/interactive'
import { AskModelPicker } from './AskModelPicker'
import type { ModelGroup } from '../domain/modelCatalog'
import {
  ASK_COMPOSER_PLACEHOLDER,
  ASK_COMPOSER_PLACEHOLDER_BROWSING,
  ASK_COMPOSER_PLACEHOLDER_DEGRADED,
  ASK_DISCLAIMER,
  ASK_PANEL_TITLE
} from '../domain/askDisplay'

interface AskPanelProps {
  model: ModelSelection
  /** One section per CLI that has something to offer. */
  modelGroups: readonly ModelGroup[]
  onModelChange: (model: ModelSelection) => void
  /** Degraded CLI: the composer stays visible but inert, so the panel never pretends it can answer. */
  disabled: boolean
  pending: boolean
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  /**
   * Stops the in-flight question. Only reachable while `pending`: the send
   * arrow morphs into the stop control (design `Screen — Preguntar · Estados`,
   * cell PENSANDO), so send and cancel can never be offered at once.
   */
  onCancel: () => void
  onClose: () => void
  /** Toggles the history browse list (design #268 §3, affordance #273 §1). */
  onToggleHistory: () => void
  historyOpen: boolean
  /**
   * How many conversations exist, or `null` when the number must not render.
   *
   * The container decides, because only it knows which thread is on screen:
   * the count appears ONLY when there are more conversations than the one
   * being viewed (design #273 §1). Encoding "do not render" as `null` rather
   * than a second boolean prop keeps the two facts from ever disagreeing.
   */
  conversationCount: number | null
  children: ReactNode
}

/**
 * The overlay shell (design `Panel — Preguntar`): 420px, docked bottom-right
 * above the trigger. The cost disclaimer is part of the SHELL rather than a
 * state, because it is true of every state — this feature spends the user's
 * own Claude usage no matter what it returns.
 *
 * Radii come from the scale: `rounded-xl` (12) on the shell, `rounded-lg` (8)
 * on the composer. The .pen originally specified 16 and 10, which were off
 * the deliberate 4/6/8/12 steps; rather than add two single-use tokens for one
 * component, the design was normalized onto the existing scale and the code
 * follows it. The shadows below still have no token — remaining debt.
 */
export function AskPanel({
  model,
  modelGroups,
  onModelChange,
  disabled,
  pending,
  value,
  onValueChange,
  onSubmit,
  onCancel,
  onClose,
  onToggleHistory,
  historyOpen,
  conversationCount,
  children
}: AskPanelProps): React.JSX.Element {
  // Browsing replaces the transcript with the conversation list, so there is
  // no thread on screen and the composer has no target. Left live it would
  // send into whatever thread sat behind the list — the very thread the user
  // is navigating away from. It stays VISIBLE and inert rather than
  // unmounting, so the panel does not resize under the pointer mid-browse.
  const composerDisabled = disabled || historyOpen

  return (
    <section
      role="dialog"
      aria-label={ASK_PANEL_TITLE}
      className="fixed right-6 bottom-24 z-40 flex w-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_#00000080]"
    >
      <header className="flex items-center justify-between px-4 py-3.5">
        {/* Title Group (gap 8): plain text. It was briefly a <button> while
            no entry affordance had been drawn — a title that is secretly a
            button is discoverable by accident at best, so it reverts now
            that the History control below exists. */}
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-primary-ink" aria-hidden="true" />
          <span className="text-body-lg font-semibold text-foreground">{ASK_PANEL_TITLE}</span>
        </div>

        {/* Panel Actions (gap 12): History + count, then Close. The count
            sits INSIDE the button so the number is part of the same target —
            a user aiming at it would otherwise click dead pixels. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
            aria-label={
              conversationCount !== null
                ? `Ver conversaciones anteriores (${conversationCount})`
                : 'Ver conversaciones anteriores'
            }
            className={cn('flex items-center gap-3 rounded-md text-muted-foreground', interactiveGhost)}
          >
            <History className="size-4" aria-hidden="true" />
            {conversationCount !== null ? <span className="text-caption font-medium">{conversationCount}</span> : null}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="h-px w-full bg-border" />

      <AskModelPicker value={model} groups={modelGroups} disabled={disabled} onChange={onModelChange} />

      <div className="h-px w-full bg-border" />

      <div className="h-[400px] overflow-y-auto p-4">{children}</div>

      <div className="h-px w-full bg-border" />

      <form
        className="flex flex-col gap-2 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5">
          <textarea
            rows={1}
            value={value}
            disabled={composerDisabled}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return
              }
              // Alt+Enter is the newline; plain Enter sends.
              if (event.altKey) {
                return
              }
              // Spanish is typed with dead keys, so Enter can land while an
              // accent is still being resolved. Submitting there would send a
              // half-typed question, so composition wins over sending.
              if (event.nativeEvent.isComposing) {
                return
              }
              event.preventDefault()
              onSubmit()
            }}
            // Degraded wins over browsing: a user can leave the list in one
            // click, but nothing works at all until the CLI is fixed, and
            // that is the message worth spending the placeholder on.
            placeholder={
              disabled
                ? ASK_COMPOSER_PLACEHOLDER_DEGRADED
                : historyOpen
                  ? ASK_COMPOSER_PLACEHOLDER_BROWSING
                  : ASK_COMPOSER_PLACEHOLDER
            }
            className="min-w-0 flex-1 resize-none bg-transparent text-body text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
          {pending ? (
            // The stop control takes the arrow's exact place, size and color:
            // the design morphs one button into the other rather than adding a
            // second one. `type="button"` so a click can never re-submit the
            // form, and never disabled — canceling is precisely the action
            // that must work while everything else in the composer is locked.
            <button type="button" aria-label="Cancelar" onClick={onCancel} className="text-primary-ink">
              <CircleStop className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Enviar"
              disabled={composerDisabled || value.trim().length === 0}
              className="text-primary-ink transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="text-caption text-muted-foreground">{ASK_DISCLAIMER}</p>
      </form>
    </section>
  )
}
