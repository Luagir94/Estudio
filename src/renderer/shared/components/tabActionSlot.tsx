// The subject detail's tab bar draws ONE action at its right end: the active
// tab's. Most of those actions cannot be lifted here, because the state they
// open lives in the slice's own container (`AdjuntosContainer` owns the file
// dialog, `ParcialesContainer` owns the parcial form). Rather than hoist that
// state out of the slices that own it, the section renders its action through
// this slot and the tab bar decides WHERE it lands.
//
// With no provider above it the slot renders inline, which is what a section
// mounted on its own — in its own test, or anywhere outside the subject
// detail — should still do.
import { createContext, use } from 'react'
import { createPortal } from 'react-dom'

const TabActionSlotContext = createContext<HTMLElement | null>(null)

export const TabActionSlotProvider = TabActionSlotContext.Provider

export function TabActionSlot({ children }: { children: React.ReactNode }): React.JSX.Element {
  const node = use(TabActionSlotContext)
  return node === null ? <>{children}</> : createPortal(children, node)
}
