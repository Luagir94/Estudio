// The sentence a screen shows when a WRITE just failed — "No se pudieron
// guardar los cambios", "No se pudo completar la eliminación".
//
// Twelve screens rendered one of these as a bare `<p className="…
// text-destructive">` and nothing else, which made the failure visible and
// silent. It arrives ASYNCHRONOUSLY, after the user already pressed the
// button and moved on, so nothing brings the reader back to it: no focus
// moves, no field is marked, the paragraph simply appears somewhere below.
//
// `role="alert"` is the whole point of this component. It is the right
// register HERE and deliberately NOT on `FieldError`: a validation run
// rejects five fields at once, and five alerts would queue five
// interruptions to say what one summary says once. This is the opposite
// case — one message, one failed action, and the user is owed it now.
//
// The type step stays a `className`, because it is genuinely per-slot: the
// footer-note slot carries `text-caption`, a dialog body carries
// `text-body-lg`. Only the semantics are shared.
import { cn } from '../../lib/cn'

export function ActionError({
  message,
  className
}: {
  message: string | null | undefined
  className?: string
}): React.JSX.Element | null {
  if (message === null || message === undefined || message === '') {
    return null
  }

  return (
    <p role="alert" className={cn('text-destructive', className)}>
      {message}
    </p>
  )
}
