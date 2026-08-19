import { describe, expect, it } from 'vitest'
import { BOUNDARY_ENTRY_ID } from './historyEntries'
import { advanceLocalEntryId, FIRST_LOCAL_ENTRY_SEED, nextLocalEntryId } from './localEntryId'

describe('nextLocalEntryId', () => {
  it('decrements by one', () => {
    expect(nextLocalEntryId(-1)).toBe(-2)
    expect(nextLocalEntryId(-2)).toBe(-3)
  })
})

describe('FIRST_LOCAL_ENTRY_SEED', () => {
  // One invariant, one literal (validator #264 mandatory fix 2): the seed IS
  // the boundary sentinel, not a second hardcoded -1.
  it('is the same value as the boundary sentinel', () => {
    expect(FIRST_LOCAL_ENTRY_SEED).toBe(BOUNDARY_ENTRY_ID)
  })
})

describe('advanceLocalEntryId (validator #264 mandatory fix 1 — pins the call order)', () => {
  it('emits -2 as the very first id, never the boundary sentinel', () => {
    const ref = { current: FIRST_LOCAL_ENTRY_SEED }

    const first = advanceLocalEntryId(ref)

    expect(first).toBe(-2)
    expect(first).not.toBe(BOUNDARY_ENTRY_ID)
  })

  // This is what would fail under the emit-then-decrement mutation validator
  // #264 tried: reading `ref.current` (still -1) BEFORE decrementing would
  // make the first id -1, identical to `BOUNDARY_ENTRY_ID`. Because
  // `advanceLocalEntryId` decrements internally before returning, there is no
  // way for a caller to observe the pre-advance value.
  it('every successive id stays strictly below the boundary sentinel and unique', () => {
    const ref = { current: FIRST_LOCAL_ENTRY_SEED }
    const ids = Array.from({ length: 5 }, () => advanceLocalEntryId(ref))

    for (const id of ids) {
      expect(id).toBeLessThan(BOUNDARY_ENTRY_ID)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mutates the passed ref in place, so a caller can reuse it across appends', () => {
    const ref = { current: FIRST_LOCAL_ENTRY_SEED }

    advanceLocalEntryId(ref)

    expect(ref.current).toBe(-2)
  })
})
