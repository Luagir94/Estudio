// The question a form modal has to ask before it throws away what you typed.
//
// Every form dialog in the app used to close on Escape, on the header's `x`
// and on Cancel by calling `onClose` straight away — a filled-in "Nueva
// materia" went to nothing on one stray key, with no undo and nothing written
// anywhere. This owns the "ask first, but only when there is something to
// lose" rule so all thirteen modals get one answer instead of thirteen.
//
// It deliberately does NOT own dirtiness. React Hook Form already computes it
// (`formState.isDirty`), and the three modals that hand-roll their state have
// their own notion of touched — a hook that tried to detect it would have to
// be told anyway.
//
// It takes a GETTER rather than a boolean, and that is a measured decision.
// RHF's `formState` is a Proxy that subscribes the component to whichever
// slice it sees READ DURING RENDER, so `formState: { isDirty }` at the
// `useForm` call site re-renders the whole modal on every change — which
// defeats the uncontrolled-input performance that is the reason this codebase
// uses RHF at all. Measured on `NuevaMateriaModal`'s submit test: 2.72s
// before, 7.18s subscribed. 2.6x, in ten modals.
//
// Reading `formState.isDirty` from inside a callback does NOT fix it either:
// RHF only COMPUTES the slices something subscribed to, so an unsubscribed
// read returns a permanently stale `false`. Hence `useValuesDirtyCheck`
// below, which asks the question once, at the only moment it matters.
import { useRef, useState } from 'react'

interface DiscardGuard {
  /** True while the confirmation is up. Render the dialog on this. */
  isConfirming: boolean
  /** Wire to Escape, the header `x` and Cancel. Asks, or closes if there is nothing to lose. */
  requestClose: () => void
  /** "Seguir editando" — dismisses the question, keeps the form. */
  keepEditing: () => void
  /** "Descartar cambios" — the answer that actually closes. */
  discard: () => void
  /**
   * Pass to the FORM dialog's `onDismiss`. It goes `undefined` while the
   * question is up, which is load-bearing: both dialogs are mounted at once
   * (the form has to stay alive, or "seguir editando" would come back to an
   * empty one), and both listen for Escape on the document. Undefined makes
   * the form's listener inert so the question owns the key.
   */
  onDismiss: (() => void) | undefined
}

/**
 * Dirtiness for a form whose values can be read on demand — RHF's `getValues`,
 * or any `() => values` a hand-rolled modal can supply.
 *
 * Snapshots the values once on mount and compares against that snapshot when
 * asked. Nothing runs per keystroke and nothing subscribes, so the modal keeps
 * re-rendering only when it actually has to. Serialised rather than
 * deep-walked because these forms hold strings, numbers and arrays of those:
 * key order is stable for one object shape, so the comparison is exact for
 * every value this app puts in a form.
 */
export function useValuesDirtyCheck(getValues: () => unknown): () => boolean {
  const initial = useRef<string | null>(null)
  if (initial.current === null) {
    initial.current = JSON.stringify(getValues())
  }
  return () => JSON.stringify(getValues()) !== initial.current
}

export function useDiscardGuard({
  isDirty,
  onClose
}: {
  /** Read at close time, never during render. See the note above. */
  isDirty: () => boolean
  onClose: () => void
}): DiscardGuard {
  const [isConfirming, setIsConfirming] = useState(false)

  const requestClose = (): void => {
    // An untouched form asks nothing. A guard that fires on every close is one
    // the user learns to click through without reading.
    if (!isDirty()) {
      onClose()
      return
    }
    setIsConfirming(true)
  }

  return {
    isConfirming,
    requestClose,
    keepEditing: () => setIsConfirming(false),
    discard: () => {
      setIsConfirming(false)
      onClose()
    },
    onDismiss: isConfirming ? undefined : requestClose
  }
}
