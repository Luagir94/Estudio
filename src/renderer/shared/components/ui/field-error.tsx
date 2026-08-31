// The wiring that connects a form's validation message to the control it is
// about.
//
// Every modal in the app already RENDERED its errors — a `<p>` in
// `text-destructive` under the field. What none of them did was say which
// field the sentence belonged to: no `aria-invalid`, no `aria-describedby`,
// zero occurrences of either across the whole renderer. So the message was
// visible and nothing else. A screen reader moving through the form heard
// "NOMBRE, cuadro de edición" on a field that had just been rejected, and the
// rejection sat in a paragraph it would only reach later, with nothing tying
// the two together.
//
// `bind` exists so the id can never drift: `aria-describedby` and the `<p>`'s
// own `id` are produced from one call, instead of being written twice at each
// of the ~29 field sites and kept in step by hand.
import { useId, useMemo } from 'react'
import { cn } from '../../lib/cn'

interface BoundField {
  /**
   * Spread onto the control, AFTER `register(...)`.
   *
   * `id` is always present, even on a valid field: it is what lets an error
   * summary send focus to the control it names, and an id that only existed
   * while the field was invalid would be an id nothing could ever link to
   * before the link was needed.
   */
  control: { id: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string }
  /** Spread onto `<FieldError />`. */
  error: { id: string; message: string | undefined }
  /** The control's own `id`, for whoever has to move focus onto it. */
  fieldId: string
}

export interface FieldErrors {
  /** `message` is the already-translated sentence, or `undefined` while the field is valid. */
  bind: (field: string, message: string | undefined) => BoundField
}

/**
 * Scoped per form instance rather than per field name: `useId` keeps the ids
 * unique even when two forms holding a field of the same name are mounted at
 * once (the subject detail can have a modal open over a screen that owns its
 * own inline form).
 */
export function useFieldErrors(): FieldErrors {
  const formId = useId()

  return useMemo(
    () => ({
      bind: (field, message) => {
        const errorId = `${formId}-${field}-error`
        const fieldId = `${formId}-${field}`
        return {
          control:
            message === undefined
              ? { id: fieldId }
              : { id: fieldId, 'aria-invalid': 'true', 'aria-describedby': errorId },
          error: { id: errorId, message },
          fieldId
        }
      }
    }),
    [formId]
  )
}

/**
 * The message itself. Renders nothing while the field is valid, so call sites
 * keep dropping it in unconditionally instead of guarding with `&&`.
 *
 * `role="alert"` is deliberately NOT here. These messages appear in a batch on
 * submit, and one alert per invalid field would queue five interruptions to
 * say what the summary says once. Announcing the batch belongs to the error
 * summary; this element's job is to be the target `aria-describedby` points
 * at, so the sentence is there when the user reaches the field.
 */
export function FieldError({
  id,
  message,
  className
}: {
  id: string
  message: string | undefined
  className?: string
}): React.JSX.Element | null {
  if (message === undefined) {
    return null
  }

  return (
    <p id={id} className={cn('text-body-lg text-destructive', className)}>
      {message}
    </p>
  )
}
