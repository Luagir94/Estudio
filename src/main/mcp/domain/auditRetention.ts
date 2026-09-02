// Two-cap audit retention plan (design D10, "Audit-flood resistance"). The
// pipe DACL lets any local process attempt handshakes, and every failure
// must be audited (spec) — so a flood of bad tokens must never be able to
// displace real success/denied history, and a flood of genuine activity
// must never be able to bury `auth-failed` history either. Kept as two
// INDEPENDENT caps for exactly that reason.

/** Newest rows kept for every outcome EXCEPT `auth-failed`. */
export const MAX_NON_AUTH_AUDIT_ROWS = 5000

/** Newest `auth-failed` rows kept, pruned under its own cap (design D10). */
export const MAX_AUTH_FAILED_AUDIT_ROWS = 500

export interface AuditRetentionRow {
  id: number
  outcome: string
}

/**
 * Computes which row ids to delete to keep the two-cap retention plan.
 * `rows` MUST already be ordered newest-first (the repository's
 * `ORDER BY occurred_at DESC` does this) — this function is a pure
 * partition-then-slice over that order, with no knowledge of how rows are
 * fetched or persisted; the repository runs the returned plan inside the
 * same transaction as the insert that triggered it.
 */
export function planAuditRetention(rows: readonly AuditRetentionRow[]): number[] {
  const authFailed = rows.filter((row) => row.outcome === 'auth-failed')
  const nonAuth = rows.filter((row) => row.outcome !== 'auth-failed')

  return [...authFailed.slice(MAX_AUTH_FAILED_AUDIT_ROWS), ...nonAuth.slice(MAX_NON_AUTH_AUDIT_ROWS)].map(
    (row) => row.id
  )
}
