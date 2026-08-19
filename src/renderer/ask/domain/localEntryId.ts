// Local-only entry ids for the ask panel (validator #262/#264 mandatory fix
// 1). `historyEntries.ts` derives every persisted entry's id from a POSITIVE
// message id, or the singleton `BOUNDARY_ENTRY_ID` sentinel (-1). A
// locally-generated optimistic entry (an in-flight question, or a turn
// `askService` could not save) must never collide with either, so its ids
// live in their own disjoint, strictly negative range starting BELOW the
// boundary sentinel.
import { BOUNDARY_ENTRY_ID } from './historyEntries'

/** Seed for the local id counter — one literal, reused from `historyEntries`
 * rather than a second hardcoded `-1` (validator #264 mandatory fix 2). */
export const FIRST_LOCAL_ENTRY_SEED = BOUNDARY_ENTRY_ID

export function nextLocalEntryId(previousLocalId: number): number {
  return previousLocalId - 1
}

/**
 * Advances `ref.current` and returns the newly generated id — decrementing
 * BEFORE reading, always, because that is the only order that keeps the
 * FIRST generated id (-2) disjoint from `BOUNDARY_ENTRY_ID` (-1). Bundling
 * the advance-and-read into one function removes the call site's ability to
 * invert that order: there is exactly one place `previousLocalId - 1` runs,
 * and its caller can only ever read the id AFTER the ref has moved.
 *
 * Validator #264 mutation-tested the old two-line call site (`nextId.current
 * = nextLocalEntryId(nextId.current); const id = nextId.current`): swapping
 * it to emit-then-decrement made the first id `-1`, colliding with
 * `BOUNDARY_ENTRY_ID`, and every existing test still passed. This function
 * is what closes that gap — see `localEntryId.test.ts`.
 */
export function advanceLocalEntryId(ref: { current: number }): number {
  ref.current = nextLocalEntryId(ref.current)
  return ref.current
}
