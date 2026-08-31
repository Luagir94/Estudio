// The block that says what a failed submit is waiting on (design:
// `Screen — Editar materia · errores`, node `Error Summary`, approved
// 2026-08-30).
//
// It exists for ONE shape of form: the tabbed one. `EditarMateriaModal` hides
// the inactive tab with `hidden`, which removes it from the view AND from the
// accessibility tree — so clearing NOMBRE, switching to Horario and pressing
// "Guardar cambios" produced nothing at all. The message was rendered, inside
// a hidden subtree, and the button read as broken. Every other form dialog in
// the app shows all of its fields at once, where the inline errors are already
// enough; this is not a block to sprinkle on all of them.
//
// So each item names its TAB before its field ("General · Nombre"). In a
// tabbed form, WHERE the error is matters as much as what it is — and showing
// both tabs' errors at once is the thing that jumping straight to the first
// error's tab cannot do, because that hides the second one.
//
// The urgent family, not warn: `$warn` in this app means "noted, carry on"
// (the slot overlap notice, the planner's clash), while a validation error
// stops the submit — and blocking field errors are already inked `$urgent`.
//
// It carries no dismiss control on purpose. The errors do not go away when the
// summary does.
import { useEffect, useRef } from 'react'
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { interactive } from '../../lib/interactive'
import { cn } from '../../lib/cn'

export interface ErrorSummaryItem {
  /** Stable key, normally the field name. */
  id: string
  /** The pane this field lives on — omitted on a single-pane form. */
  group?: string
  label: string
  message: string
  /** Reveals the field and puts focus on it. */
  onGo: () => void
}

export function ErrorSummary({ items }: { items: ErrorSummaryItem[] }): React.JSX.Element | null {
  const { t } = useTranslation('common')
  const containerRef = useRef<HTMLDivElement>(null)

  // Focus lands on the summary, not on the first bad field: the whole point is
  // that the reader gets the FULL list before being dropped somewhere in it.
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  if (items.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      role="alert"
      tabIndex={-1}
      className="mx-6 flex items-start gap-3 rounded-lg border border-destructive bg-(--color-urgent-soft) p-3"
    >
      <CircleAlert className="mt-px h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <strong className="text-body font-semibold text-foreground">
          {t('errorSummary.title', { count: items.length })}
        </strong>
        {items.map((item) => (
          // A button, not an `<a href="#id">`: this app is a hash-routed
          // window, so an anchor would rewrite the address to reach a field
          // three centimetres away.
          <button
            key={item.id}
            type="button"
            onClick={item.onGo}
            aria-label={t('errorSummary.goToField', { field: item.label })}
            className={cn('text-left text-body font-semibold text-destructive underline-offset-2', interactive)}
          >
            {item.group === undefined
              ? `${item.label} — ${item.message}`
              : `${item.group} · ${item.label} — ${item.message}`}
          </button>
        ))}
      </div>
    </div>
  )
}
