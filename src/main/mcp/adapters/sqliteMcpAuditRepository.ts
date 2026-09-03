import { desc, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { mcpAuditEntries } from '../../db/schema'
import type { AuditOutcome } from '../domain/auditEntry'
import { planAuditRetention } from '../domain/auditRetention'

export interface McpAuditEntryInput {
  /** Caller-supplied timestamp, same convention as every other repository in this codebase — the repository never calls `Date.now()` itself. */
  occurredAt: string
  /** `null` for `auth-failed` — no tool was ever dispatched (design "Drizzle schema"). */
  tool: string | null
  slice: string | null
  action: string | null
  outcome: AuditOutcome
  summary: string
  clientName: string | null
  errorCode: string | null
}

export interface McpAuditRepository {
  /**
   * Inserts one audit row, then prunes under the two-cap retention plan
   * (`domain/auditRetention.ts`, design D10). Both the insert and the prune
   * run inside the SAME transaction — a crash between them can never leave
   * either cap exceeded, and a flood under one outcome group can never
   * evict rows that belong to the other group's independent cap.
   */
  insert(input: McpAuditEntryInput): void
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
      db.transaction((tx) => {
        tx.insert(mcpAuditEntries).values(input).run()

        const rows = tx
          .select({ id: mcpAuditEntries.id, outcome: mcpAuditEntries.outcome })
          .from(mcpAuditEntries)
          .orderBy(desc(mcpAuditEntries.occurredAt), desc(mcpAuditEntries.id))
          .all()

        const idsToDelete = planAuditRetention(rows)
        if (idsToDelete.length > 0) {
          tx.delete(mcpAuditEntries).where(inArray(mcpAuditEntries.id, idsToDelete)).run()
        }
      })
    }
  }
}
