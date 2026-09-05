import { z } from 'zod'

// Pagination for the catalog's list tools.
//
// WHERE this happens is a deliberate choice. The pages are cut here, over the
// repository's full result, NOT pushed down into the repositories as
// `limit`/`offset` SQL. The repositories are shared with the IPC path, and the
// renderer genuinely needs every row to draw a screen — widening four shared
// contracts to serve one consumer would be paying in the wrong place. And the
// pressure these tools are actually under is not the app's memory: it is the
// CONTEXT of the agent on the other end, which a `materias_list` carrying
// every subject with its slots, deadlines, finals and correlativas fills up
// fast. Cutting the page here fixes exactly that, and the day row counts stop
// being a personal study load, `paginate` is the one seam to move.

/** Rows returned when a caller states no `limit` — the "20-50" the MCP guidance suggests, at the low end. */
export const DEFAULT_PAGE_SIZE = 25

/** The largest page a caller may ask for. Beyond this the schema REJECTS, rather than quietly returning fewer rows than asked. */
export const MAX_PAGE_SIZE = 200

/**
 * The list tools' input contract. Offset-based rather than cursor-based: this
 * is one local SQLite file read by one desktop app, so there is no replica lag
 * or shifting result set for a cursor to protect against, and an offset a
 * client can reason about beats an opaque token it cannot.
 */
export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.number().int().min(0).optional()
})

export type PaginationInput = z.output<typeof paginationInputSchema>

export interface Page<T> {
  items: T[]
  /** Rows the query matched in total, not on this page — this is what tells a caller whether to keep walking. */
  total: number
  count: number
  offset: number
  hasMore: boolean
  /** The `offset` that returns the next page, or `null` at the end, so a caller never has to do the arithmetic. */
  nextOffset: number | null
}

/**
 * Cuts one page. Assumes `input` already went through
 * `paginationInputSchema` — which is guaranteed for every MCP call, because
 * `mcpServerFactory`'s parse runs before `exec` — so it applies defaults and
 * does no clamping of its own: a limit the schema would reject should reach
 * the client as a validation error, never as a silently different page.
 */
export function paginate<T>(rows: readonly T[], input: PaginationInput): Page<T> {
  const limit = input.limit ?? DEFAULT_PAGE_SIZE
  const offset = input.offset ?? 0
  const items = rows.slice(offset, offset + limit)
  const hasMore = offset + items.length < rows.length

  return {
    items,
    total: rows.length,
    count: items.length,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null
  }
}

/**
 * The audit line for a paginated list call. Counts only — no row, no
 * identifier list, no payload — the same contract `auditEntry.ts` holds every
 * `summarize` to.
 */
export function pageSummary(toolName: string, page: Page<unknown> | null): string {
  return page === null ? `${toolName} → 0 rows` : `${toolName} → ${page.count} of ${page.total} rows`
}
