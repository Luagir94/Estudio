import { createHash } from 'node:crypto'
import path from 'node:path'

// Endpoint derivation for the internal MCP leg (design D1). Framework-free
// and shared by BOTH main and the dependency-free shim (bundled into it) —
// unlike `src/shared/ipc/**`, this module is never imported by the
// renderer, so it is free to use Node's `node:crypto`/`node:path` the same
// way `src/shared/domain/**` stays framework-free of Electron: no
// renderer-unsafe API is added to a module the renderer actually loads.
//
// A Windows named pipe on win32, a Unix socket path elsewhere; both sides
// compute the SAME name deterministically from the OS username, so no file
// or port is needed for discovery (design D1's comparison table).
// `resolveEndpoint` never takes a token: the pipe/socket NAME carries no
// secret by construction (threat-matrix: "Token in pipe name / argv /
// log" — forbidden by this signature having no token parameter at all).

/** Env var both the app and the shim read for test-isolation endpoint override (design D1). */
export const MCP_ENDPOINT_ENV_VAR = 'COURSE_COMPANION_MCP_ENDPOINT'

const PIPE_NAME_HASH_LENGTH = 16

export interface ResolveEndpointInput {
  platform: NodeJS.Platform
  username: string
  tmpdir: string
  /** `process.env[MCP_ENDPOINT_ENV_VAR]` — test isolation override, honoured unconditionally when set. */
  override?: string
}

/**
 * Resolves the internal-leg endpoint: `override` wins unconditionally when
 * set (test isolation — a Playwright launch on a developer machine would
 * otherwise collide with a dev instance running under the same account).
 * Otherwise derives a name from the first 16 hex characters of
 * `sha256(username)` — short enough to stay a legal Windows pipe segment,
 * long enough that collision is not a practical concern for a per-user
 * local name.
 */
export function resolveEndpoint(input: ResolveEndpointInput): string {
  if (input.override) {
    return input.override
  }

  const suffix = createHash('sha256').update(input.username, 'utf8').digest('hex').slice(0, PIPE_NAME_HASH_LENGTH)

  return input.platform === 'win32'
    ? `\\\\.\\pipe\\course-companion-mcp-${suffix}`
    : path.join(input.tmpdir, `course-companion-mcp-${suffix}.sock`)
}
