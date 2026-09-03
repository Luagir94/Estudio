import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test } from '@playwright/test'

// Task 11.3 — proves spec "Listener lifecycle is gated by token and grant
// state" against the REAL app: the listener PR11 exists to turn on. There is
// no UI to issue a token or grant a slice yet (Ajustes' McpTokenCard /
// McpPermissionsCard ship in PR15/PR16), so this spec seeds
// `app_settings`/`mcp_slice_permissions` directly, following the SAME
// precedent `ask-my-materials.spec.ts` set for the opt-in row it seeds: one
// throwaway `_electron.launch()` to run the forward-only migration, close
// it, open `course-companion.db` with `better-sqlite3`, write the rows by
// hand, then launch for real.
//
// ISOLATION: `COURSE_COMPANION_MCP_ENDPOINT` is passed through
// `electron.launch({ env })`, a fresh random pipe name per phase. Its real
// purpose (design D1) is isolating this spec from a same-username dev
// instance of the app that might already hold the real per-user pipe name —
// the endpoint derives from `sha256(username)`, never from
// `--user-data-dir`, so an isolated user-data-dir alone does NOT isolate it.
//
// WHAT THIS DELIBERATELY DOES NOT DO: drive a real MCP round trip (shim,
// handshake, `tools/list`). That is PR13's job, once the shim exists
// (PR12). This spec only proves the listener's start/stop DECISION — whether
// `net.connect` to the resolved endpoint succeeds or is refused — never a
// handshake or a tool call.

function testEndpoint(): string {
  const suffix = randomBytes(8).toString('hex')
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\course-companion-mcp-e2e-${suffix}`
    : path.join(os.tmpdir(), `course-companion-mcp-e2e-${suffix}.sock`)
}

/** Whether a raw connection attempt to `endpoint` succeeds or is refused — never a handshake. */
function attemptConnect(endpoint: string, timeoutMs = 3000): Promise<'connected' | 'refused'> {
  return new Promise((resolve) => {
    const socket = net.connect(endpoint)
    const timer = setTimeout(() => {
      socket.destroy()
      resolve('refused')
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve('connected')
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve('refused')
    })
  })
}

test('the MCP listener starts only once a token AND a slice grant both exist', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-'))
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )

  const launch = (endpoint: string) =>
    electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: projectRoot,
      env: { ...inheritedEnv, COURSE_COMPANION_MCP_ENDPOINT: endpoint }
    })

  // One throwaway launch to run the forward-only migration, so there is a
  // schema to seed the token/grant into (same precedent `ask-my-materials`
  // established).
  const migrating = await launch(testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  try {
    // Phase 1: zero grants (no token, no permission row) — the listener must
    // not start (spec "No grants, no listener").
    const noGrantEndpoint = testEndpoint()
    const noGrantApp = await launch(noGrantEndpoint)
    try {
      await (await noGrantApp.firstWindow()).waitForLoadState('domcontentloaded')
      expect(await attemptConnect(noGrantEndpoint)).toBe('refused')
    } finally {
      await noGrantApp.close()
    }

    // Seed a token hash and one slice grant directly into the DB — there is
    // no UI to do this yet (PR15/PR16). The token's actual VALUE is
    // irrelevant to `reconcileListener`'s decision: it only checks that a
    // hash row exists, never validates it against anything at this point.
    const raw = new Database(path.join(userDataDir, 'course-companion.db'))
    try {
      raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('mcp.tokenHash', 'e2e-fake-token-hash')
      raw
        .prepare('INSERT INTO mcp_slice_permissions (slice, can_read, can_write, updated_at) VALUES (?, ?, ?, ?)')
        .run('materias', 1, 0, new Date().toISOString())
    } finally {
      raw.close()
    }

    // Phase 2: a token and a grant both exist — the listener must start
    // (spec "Listener lifecycle is gated by token and grant state").
    const grantedEndpoint = testEndpoint()
    const grantedApp = await launch(grantedEndpoint)
    try {
      await (await grantedApp.firstWindow()).waitForLoadState('domcontentloaded')
      expect(await attemptConnect(grantedEndpoint)).toBe('connected')
    } finally {
      await grantedApp.close()
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
