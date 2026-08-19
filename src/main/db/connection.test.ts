import { describe, expect, it } from 'vitest'
import { openAppDatabase } from './connection'

// Gate finding (sdd/course-companion/gate-findings/slice-2a, Finding 1): SQLite's
// `ON DELETE CASCADE` is inert unless `PRAGMA foreign_keys = ON` is set on the
// connection performing the delete — and it is off by default. The prior
// suite only ever exercised a hand-rolled test connection, so this test
// asserts the pragma against the PRODUCTION connection factory itself:
// deleting line 15 of connection.ts must make this test fail.
describe('openAppDatabase (production connection factory)', () => {
  it('enables foreign_keys on the connection it returns', () => {
    const { raw } = openAppDatabase(':memory:')

    expect(raw.pragma('foreign_keys', { simple: true })).toBe(1)

    raw.close()
  })
})
