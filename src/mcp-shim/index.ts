import net from 'node:net'
import os from 'node:os'
import { MCP_ENDPOINT_ENV_VAR, resolveEndpoint } from '../shared/mcp/endpoint'
import { runRelay } from './relay'

// The shim's only entry point: wires `relay.ts`'s pure logic to the real
// process streams and a real `node:net` connection. This is the ONE file
// under `src/mcp-shim/` allowed to import `node:net` (design D4's
// `listener-only-in-mcp-slice` guard rule, `tooling/dependencyGuard.mts`)
// and the only one that touches `process` at all — everything else in this
// module lives in `relay.ts`, injected and unit-tested there. No colocated
// test (design "Module Layout"): this file is wiring only, covered by the
// round-trip e2e (PR13), the same split `pipeListener.ts`'s own `node:net`
// exemption follows on the app side.
//
// Spawned by an external MCP client with the SYSTEM Node (design D2) — this
// file is never bundled inside `app.asar` and never runs under Electron's
// own Node, so it cannot assume any Electron API exists.

const endpoint = resolveEndpoint({
  platform: process.platform,
  username: os.userInfo().username,
  tmpdir: os.tmpdir(),
  override: process.env[MCP_ENDPOINT_ENV_VAR]
})

runRelay({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  connect: () => net.connect(endpoint),
  env: process.env,
  exit: (code) => process.exit(code)
})
