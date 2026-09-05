// Pure, framework-free (mcp-app-control task 15.2): builds the exact
// `{ command, args, env }` snippet documented in `docs/development.md`'s
// "Point your MCP client at the shim" section, from the real shim path and
// token instead of one hand-copied from docs. No IPC, no React — nothing
// here needs a Zod parse because nothing here reads untrusted input.
//
// The ENTRY itself is no longer built here: `buildServerEntry` lives in the
// shared contract because main needs the identical object to merge into a
// client's own config file. Two builders would be two chances to drift, and
// the drift would only ever surface as a client that quietly stopped
// connecting. This module owns the clipboard SERIALISATION and nothing else.
import { buildServerEntry } from '../../../shared/ipc/mcp'

export function buildClientConfig(shimPath: string, token: string): string {
  return JSON.stringify({ mcpServers: { 'course-companion': buildServerEntry(shimPath, token) } }, null, 2)
}
