// One piece of screen state that the ADDRESS may own, and otherwise the
// component does.
//
// The renderer's rule (see `router.tsx`) is that containers stay prop-driven
// and router-unaware: the route components are thin adapters that translate a
// path into props. Putting `useSearch()` inside a container would break that
// — and break every container test, none of which mounts a router.
//
// So the container keeps working exactly as before when nothing is passed,
// and hands its state over to the caller when both halves arrive. Both, never
// one: a `value` with no `onChange` is a control that cannot move, and an
// `onChange` with no `value` is a caller that is told about changes it does
// not hold. Either alone is a wiring mistake, so either alone falls back.
//
// Which puts one obligation on the ROUTE side: `useSearch()` yields
// `undefined` for a search param the address does not carry, and that is the
// common case — nothing links to a screen with its `?tab=` already on it. A
// route component that hands over an `onChange` therefore has to resolve that
// absence into the screen's default BEFORE passing it down, or the first
// interaction moves state that lives here and never reaches the address. Each
// default is exported once (`DEFAULT_CARRERA_TAB`, `DEFAULT_SUBJECT_DETAIL_TAB`,
// `DEFAULT_SUBJECT_STATUS_FILTER`) so the route and the container cannot
// disagree about what it is.
import { useState } from 'react'

export function useOptionalControlled<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initial: T
): [T, (next: T) => void] {
  // Always called — the fallback has to exist whether or not it is read, or
  // the hook order would change with the props.
  const [internal, setInternal] = useState(initial)

  if (value === undefined || onChange === undefined) {
    return [internal, setInternal]
  }
  return [value, onChange]
}
