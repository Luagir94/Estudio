import { eq, or } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import { mcpSlicePermissions } from '../../db/schema'
import type { McpSlice, McpSliceGrant, PermissionMatrix } from '../domain/permissions'

export interface SetMcpPermissionInput {
  slice: McpSlice
  canRead: boolean
  canWrite: boolean
  /** Caller-supplied timestamp, same convention as every other repository in this codebase (e.g. `sqliteAskHistoryRepository`'s `input.createdAt`) — the repository never calls `Date.now()` itself. */
  updatedAt: string
}

export interface McpPermissionRepository {
  /**
   * The full grant matrix, keyed only by slices that HAVE a row. A slice
   * absent from the result denies both actions (design "Drizzle schema"
   * repository rule: "Absence of a permission row = no access"), which is
   * exactly the shape `domain/permissions.ts`'s `isAllowed` already expects.
   */
  getMatrix(): PermissionMatrix
  /** Upserts the slice's grant. Returns the persisted grant. */
  setPermission(input: SetMcpPermissionInput): McpSliceGrant
  /** True iff at least one slice has read or write granted (design D8/spec: the listener starts only when a token exists AND some slice is granted). */
  hasAnyGrant(): boolean
}

/**
 * SQLite-backed implementation of the per-slice MCP permission matrix
 * (mcp-app-control design D7-D9, spec "mcp-slice-permissions"). `slice` is
 * the table's primary key, so writing the same slice twice updates the
 * existing row instead of accumulating history — there is exactly one
 * current grant per slice, ever.
 */
export function createSqliteMcpPermissionRepository(db: AppDatabase): McpPermissionRepository {
  return {
    getMatrix() {
      const rows = db.select().from(mcpSlicePermissions).all()
      const matrix: PermissionMatrix = {}
      for (const row of rows) {
        matrix[row.slice as McpSlice] = { canRead: row.canRead, canWrite: row.canWrite }
      }
      return matrix
    },
    setPermission({ slice, canRead, canWrite, updatedAt }) {
      db.insert(mcpSlicePermissions)
        .values({ slice, canRead, canWrite, updatedAt })
        .onConflictDoUpdate({ target: mcpSlicePermissions.slice, set: { canRead, canWrite, updatedAt } })
        .run()
      return { canRead, canWrite }
    },
    hasAnyGrant() {
      return (
        db
          .select({ slice: mcpSlicePermissions.slice })
          .from(mcpSlicePermissions)
          .where(or(eq(mcpSlicePermissions.canRead, true), eq(mcpSlicePermissions.canWrite, true)))
          .all().length > 0
      )
    }
  }
}
