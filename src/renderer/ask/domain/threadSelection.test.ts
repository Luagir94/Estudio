import { describe, expect, it } from 'vitest'
import { activeConversationId, selectionAfterDelete, type ThreadSelection } from './threadSelection'

describe('activeConversationId', () => {
  it('resume follows the first (most recently updated) conversation', () => {
    const conversations = [{ id: 7 }, { id: 3 }]

    expect(activeConversationId({ kind: 'resume' }, conversations)).toBe(7)
  })

  // First-ever run, no conversations at all: resume falls to blank.
  it('resume resolves to null when there are no conversations yet', () => {
    expect(activeConversationId({ kind: 'resume' }, [])).toBeNull()
  })

  // "A deleted resume target falls back": resume has no memory of a specific
  // target id — it is recomputed from whatever the list currently contains,
  // so a target that no longer exists simply cannot be selected.
  it('resume falls back to the next most recent once the prior target is gone from the list', () => {
    const conversations = [{ id: 3 }]

    expect(activeConversationId({ kind: 'resume' }, conversations)).toBe(3)
  })

  it('thread names its id explicitly, regardless of the list', () => {
    expect(activeConversationId({ kind: 'thread', id: 42 }, [{ id: 1 }])).toBe(42)
    expect(activeConversationId({ kind: 'thread', id: 42 }, [])).toBe(42)
  })

  // RED (design D6 rev 2): `new` must NEVER resolve to the latest thread,
  // no matter how many conversations exist or in what order.
  it('new always resolves to null, never the latest conversation', () => {
    const conversations = [{ id: 99 }, { id: 1 }]

    expect(activeConversationId({ kind: 'new' }, conversations)).toBeNull()
    expect(activeConversationId({ kind: 'new' }, [])).toBeNull()
  })
})

describe('selectionAfterDelete', () => {
  it('resets the currently-viewed thread to resume when it is the one deleted', () => {
    const selection: ThreadSelection = { kind: 'thread', id: 5 }

    expect(selectionAfterDelete(selection, 5)).toEqual({ kind: 'resume' })
  })

  it('leaves a different thread selection untouched', () => {
    const selection: ThreadSelection = { kind: 'thread', id: 5 }

    expect(selectionAfterDelete(selection, 9)).toBe(selection)
  })

  it('leaves resume and new untouched, regardless of what was deleted', () => {
    expect(selectionAfterDelete({ kind: 'resume' }, 5)).toEqual({ kind: 'resume' })
    expect(selectionAfterDelete({ kind: 'new' }, 5)).toEqual({ kind: 'new' })
  })
})
