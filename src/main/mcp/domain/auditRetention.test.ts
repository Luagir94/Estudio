import { describe, expect, it } from 'vitest'
import {
  MAX_AUTH_FAILED_AUDIT_ROWS,
  MAX_NON_AUTH_AUDIT_ROWS,
  planAuditRetention,
  type AuditRetentionRow
} from './auditRetention'

/** Builds `count` synthetic rows sharing `outcome`, ids ascending from `startId`. */
function rows(count: number, outcome: string, startId: number): AuditRetentionRow[] {
  return Array.from({ length: count }, (_, index) => ({ id: startId + index, outcome }))
}

describe('planAuditRetention', () => {
  it('deletes nothing when both caps have headroom', () => {
    const input = [...rows(2, 'success', 1), ...rows(1, 'auth-failed', 100)]

    expect(planAuditRetention(input)).toEqual([])
  })

  it('prunes only the oldest non-auth rows beyond the 5,000 cap (input is newest-first)', () => {
    const input = rows(MAX_NON_AUTH_AUDIT_ROWS + 3, 'success', 1)

    const toDelete = planAuditRetention(input)

    expect(toDelete).toEqual([MAX_NON_AUTH_AUDIT_ROWS + 1, MAX_NON_AUTH_AUDIT_ROWS + 2, MAX_NON_AUTH_AUDIT_ROWS + 3])
  })

  it('prunes only the oldest auth-failed rows beyond the 500 cap, independent of the non-auth cap', () => {
    const input = [...rows(10, 'success', 1), ...rows(MAX_AUTH_FAILED_AUDIT_ROWS + 2, 'auth-failed', 1000)]

    const toDelete = planAuditRetention(input)

    expect(toDelete).toEqual([1000 + MAX_AUTH_FAILED_AUDIT_ROWS, 1000 + MAX_AUTH_FAILED_AUDIT_ROWS + 1])
  })

  it('a flood of auth-failed rows never prunes success/denied rows sharing the table (design D10)', () => {
    const genuine = rows(4, 'denied', 1)
    const flood = rows(MAX_AUTH_FAILED_AUDIT_ROWS + 500, 'auth-failed', 1000)

    const toDelete = planAuditRetention([...genuine, ...flood])

    expect(toDelete).toHaveLength(500)
    expect(toDelete).not.toContain(1)
    expect(toDelete).not.toContain(2)
    expect(toDelete).not.toContain(3)
    expect(toDelete).not.toContain(4)
  })

  it('applies caps to mixed outcomes together as one non-auth group (denied/invalid/error/success)', () => {
    const mixed = [
      ...rows(1, 'success', 1),
      ...rows(1, 'denied', 2),
      ...rows(1, 'invalid', 3),
      ...rows(MAX_NON_AUTH_AUDIT_ROWS - 3, 'error', 4)
    ]
    const oneOver = [...mixed, { id: 99999, outcome: 'success' }]

    const toDelete = planAuditRetention(oneOver)

    expect(toDelete).toEqual([99999])
  })
})
