// Thread selection (design D6 rev 2 — root-cause fix for validator #255's
// two blockers). Rev 1 collapsed "no thread chosen yet" and "the last write
// failed" into the same `null`; this discriminated shape makes that defect
// structurally unrepresentable.
export type ThreadSelection = { kind: 'resume' } | { kind: 'thread'; id: number } | { kind: 'new' }

/** Pure function of `(selection, conversations)`: `resume` follows the
 * server-ordered list's first (latest) entry; `thread` names one explicitly;
 * `new` is always NO id, regardless of list contents — a blank thread can
 * never silently pick up the latest one. */
export function activeConversationId(
  selection: ThreadSelection,
  conversations: readonly { id: number }[]
): number | null {
  if (selection.kind === 'thread') {
    return selection.id
  }
  if (selection.kind === 'new') {
    return null
  }
  return conversations[0]?.id ?? null
}

/** Deleting the currently-viewed thread resets selection to `resume`; any
 * other selection is untouched by an unrelated deletion (design D6). */
export function selectionAfterDelete(selection: ThreadSelection, deletedId: number): ThreadSelection {
  if (selection.kind === 'thread' && selection.id === deletedId) {
    return { kind: 'resume' }
  }
  return selection
}
