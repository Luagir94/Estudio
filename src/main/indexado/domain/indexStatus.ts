// Pure closed-set guard for `attachments.indexStatus` (attachment-fts-index
// design "Status storage", spec "Status lifecycle"). No SQL CHECK/enum
// table backs this column — same convention as `subjects.outcome` and
// `deadlines.type` — so this module is the ONE place the closed set is
// spelled out and enforced before a caller (indexadoService, slice 2b)
// writes a status.
export type IndexStatus = 'pending' | 'indexed' | 'not-indexable'

const INDEX_STATUSES: readonly IndexStatus[] = ['pending', 'indexed', 'not-indexable']

export function isIndexStatus(value: string): value is IndexStatus {
  return (INDEX_STATUSES as readonly string[]).includes(value)
}

export class InvalidIndexStatusError extends Error {
  constructor(value: string) {
    super(`INVALID_INDEX_STATUS: not a member of the closed set: ${value}`)
    this.name = 'InvalidIndexStatusError'
  }
}

/**
 * Validates a proposed status transition and returns the target status.
 * Rejects any `from`/`to` outside the closed set — a malformed value from
 * calling code must never reach the database.
 *
 * The closed set has no illegal EDGES among its three members, only
 * illegal VALUES: every status may move to any other status, including
 * itself. That "to itself" case is what makes re-running indexing on a
 * terminal-state attachment idempotent (spec "Re-indexing is idempotent") —
 * this guard deliberately is not a strict forward-only state machine.
 */
export function guardIndexStatusTransition(from: string, to: string): IndexStatus {
  if (!isIndexStatus(from)) {
    throw new InvalidIndexStatusError(from)
  }
  if (!isIndexStatus(to)) {
    throw new InvalidIndexStatusError(to)
  }
  return to
}
