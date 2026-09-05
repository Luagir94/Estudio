// Pure read-modify-write core for registering this app's shim in a THIRD-PARTY
// MCP client's own config file. No fs, no IPC, no Electron: `string | null` in,
// `string` out, so every branch below is reachable from a unit test without
// touching a real config file on a developer's machine.
//
// The whole module exists to own exactly ONE key. `~/.claude.json` is the
// user's entire Claude Code state — startup counters, per-project permissions,
// cached experiment data, and the other MCP servers they registered themselves.
// This app writes `mcpServers['course-companion']` and copies everything else
// through untouched.
//
// Formatting is NOT preserved: the output is re-serialised at two-space indent.
// That is acceptable for JSON precisely because JSON carries no comments to
// lose. A TOML client would lose the user's own comments on the same round
// trip, which is why Codex is NOT served from here: it goes through
// `mergeTomlClientConfig`, which never parses the file and edits only the byte
// range of the one table this app owns.

/** The single key this app owns inside a client's server map. Never a name derived from user input. */
export const COURSE_COMPANION_SERVER_KEY = 'course-companion'

/** The `{ command, args, env }` shape every stdio-based MCP client accepts. */
export interface McpServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Why a merge refused. Each one means "this app did not understand the file",
 * never "the file is wrong" — the user's config is not this app's to correct.
 *
 * `servers-not-tables` is raised only by the TOML sibling, and lives here
 * because both merges answer on the same `MergeResult` and the writer maps
 * every reason from one table.
 */
export type MergeRefusal = 'unparseable' | 'not-an-object' | 'servers-not-an-object' | 'servers-not-tables'

export type MergeResult =
  | {
      ok: true
      contents: string
      /** `false` when the file already says exactly this. The writer skips the backup-and-write on a no-op. */
      changed: boolean
    }
  | { ok: false; reason: MergeRefusal }

const INDENT = 2

type JsonObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads the existing file into a mutable top-level object, or states why it
 * could not. An absent file (`null`) and a whitespace-only one are the SAME
 * case — a client that has never been configured may have created an empty
 * file, and refusing that would block the very first write.
 */
function readRoot(raw: string | null): { ok: true; root: JsonObject } | { ok: false; reason: MergeRefusal } {
  if (raw === null || raw.trim() === '') {
    return { ok: true, root: {} }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'unparseable' }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'not-an-object' }
  }

  return { ok: true, root: parsed }
}

/**
 * Reads the server map under `serversKey`. An absent key is fine — it is
 * created. A key holding an array, a string or a number is NOT: this app would
 * have to destroy a value it does not understand to proceed, so it stops.
 */
function readServers(
  root: JsonObject,
  serversKey: string
): { ok: true; servers: JsonObject } | { ok: false; reason: MergeRefusal } {
  const existing = root[serversKey]
  if (existing === undefined) {
    return { ok: true, servers: {} }
  }
  if (!isPlainObject(existing)) {
    return { ok: false, reason: 'servers-not-an-object' }
  }
  return { ok: true, servers: existing }
}

const serialise = (root: JsonObject, serversKey: string, servers: JsonObject, changed: boolean): MergeResult => ({
  ok: true,
  contents: `${JSON.stringify({ ...root, [serversKey]: servers }, null, INDENT)}\n`,
  changed
})

/**
 * Returns the client's config file with this app's server entry present and
 * current, leaving every other key and every other server exactly as found.
 *
 * Idempotent by construction: re-running with an unchanged entry reports
 * `changed: false` so a caller can skip rewriting a large file for nothing.
 */
export function mergeClientConfig(raw: string | null, serversKey: string, entry: McpServerEntry): MergeResult {
  const rootResult = readRoot(raw)
  if (!rootResult.ok) {
    return rootResult
  }

  const serversResult = readServers(rootResult.root, serversKey)
  if (!serversResult.ok) {
    return serversResult
  }

  const current = serversResult.servers[COURSE_COMPANION_SERVER_KEY]
  const changed = JSON.stringify(current) !== JSON.stringify(entry)

  return serialise(
    rootResult.root,
    serversKey,
    { ...serversResult.servers, [COURSE_COMPANION_SERVER_KEY]: entry },
    changed
  )
}

/**
 * Returns the client's config file with this app's entry gone — the revoke
 * half, so a revoked token does not leave a dead server behind in a client the
 * user then has to clean up by hand.
 *
 * An emptied `serversKey` is left in place as `{}` rather than deleted: the key
 * may have been the user's own, and removing a key this app did not create
 * would exceed what "remove our entry" means.
 */
export function removeClientConfig(raw: string | null, serversKey: string): MergeResult {
  const rootResult = readRoot(raw)
  if (!rootResult.ok) {
    return rootResult
  }

  const serversResult = readServers(rootResult.root, serversKey)
  if (!serversResult.ok) {
    return serversResult
  }

  if (!(COURSE_COMPANION_SERVER_KEY in serversResult.servers)) {
    return { ok: true, contents: raw ?? '', changed: false }
  }

  const { [COURSE_COMPANION_SERVER_KEY]: _removed, ...remaining } = serversResult.servers

  return serialise(rootResult.root, serversKey, remaining, true)
}
