import { desc, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { mcpAuditEntries } from '../../db/schema'
import type { AuditOutcome } from '../domain/auditEntry'
import { planAuditRetention } from '../domain/auditRetention'
import type { McpAction } from '../domain/permissions'

export interface McpAuditEntryInput {
  /** Caller-supplied timestamp, same convention as every other repository in this codebase — the repository never calls `Date.now()` itself. */
  occurredAt: string
  /** `null` for `auth-failed` — no tool was ever dispatched (design "Drizzle schema"). */
  tool: string | null
  slice: string | null
  /** `null` for `auth-failed`; otherwise the closed `read`/`write` set (task 14.3: narrowed from a bare `string` so `list()`'s result assigns cleanly to `shared/ipc/mcp.ts`'s `mcpAuditEntrySchema`, which advertises the same closed set — the DB column itself stays plain `text`, this is a TypeScript-level tightening only). */
  action: McpAction | null
  outcome: AuditOutcome
  summary: string
  clientName: string | null
  errorCode: string | null
}

/** One persisted row, as `mcp:listActivity` (task 14.3) reads it back — the same fields `McpAuditEntryInput` writes, plus the assigned `id`. */
export interface StoredMcpAuditEntry extends McpAuditEntryInput {
  id: number
}

export interface McpAuditRepository {
  /**
   * Inserts one audit row, then prunes under the two-cap retention plan
   * (`domain/auditRetention.ts`, design D10). Both the insert and the prune
   * run inside the SAME transaction — a crash between them can never leave
   * either cap exceeded, and a flood under one outcome group can never
   * evict rows that belong to the other group's independent cap. Returns the
   * new row's id (task 14.3): the row just inserted is always the newest by
   * `occurredAt`/`id`, so the retention prune — which only ever deletes the
   * OLDEST rows in a group — can never evict it in the same transaction.
   * `mcpService.dispatchAudit` uses this id to fan out
   * `MCP_ACTIVITY_CHANGED_CHANNEL` (design D9).
   */
  insert(input: McpAuditEntryInput): { id: number }
  /** Newest-first (spec "Activity trail is visible in-app, newest first"), capped at `limit` when given (design D10's own 500-row IPC cap). */
  list(limit?: number): StoredMcpAuditEntry[]
}

/**
 * SQLite-backed implementation of the MCP audit trail (mcp-app-control
 * design D10, "mcp-activity-audit"). The retention plan itself is a pure
 * function owned by `domain/auditRetention.ts`; this adapter only supplies
 * the newest-first row order the plan expects and applies its verdict.
 */
export function createSqliteMcpAuditRepository(db: AppDatabase): McpAuditRepository {
  return {
    insert(input) {
      return db.transaction((tx) => {
        const inserted = tx.insert(mcpAuditEntries).values(input).returning({ id: mcpAuditEntries.id }).get()

        const rows = tx
          .select({ id: mcpAuditEntries.id, outcome: mcpAuditEntries.outcome })
          .from(mcpAuditEntries)
          .orderBy(desc(mcpAuditEntries.occurredAt), desc(mcpAuditEntries.id))
          .all()

        const idsToDelete = planAuditRetention(rows)
        if (idsToDelete.length > 0) {
          tx.delete(mcpAuditEntries).where(inArray(mcpAuditEntries.id, idsToDelete)).run()
        }

        return { id: inserted.id }
      })
    },
    list(limit) {
      const query = db
        .select()
        .from(mcpAuditEntries)
        .orderBy(desc(mcpAuditEntries.occurredAt), desc(mcpAuditEntries.id))
      return (limit === undefined ? query.all() : query.limit(limit).all()) as StoredMcpAuditEntry[]
    }
  }
}
