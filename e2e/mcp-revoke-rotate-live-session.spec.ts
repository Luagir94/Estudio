import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test } from '@playwright/test'

// sdd-verify (obs #584) found that "Revoked token cannot keep working on an
// established session" and "Rotation terminates an open connection" — both
// tagged [e2e] in the spec — had only unit-level proof
// (`mcpService.test.ts:388-405`, a fake socket) despite the tag. That unit
// test IS real evidence (it asserts the tracked connection is marked stale
// AND `socket.end()` is called, not merely that the listener stops accepting
// NEW connections), but it never drives a real named pipe with a real shim
// process attached, and it never goes through the actual Ajustes UI a user
// would click. This file closes that specific gap.
//
// The precise failure mode this file exists to catch: an implementation that
// stops the LISTENER on revoke/rotate but forgets to actively close already-
// open connections would pass a naive "a new connection is now refused" test
// while leaving an already-authenticated session able to keep executing tool
// calls with a token the user believes is dead. Every test below drives a
// session to a PROVEN-live state (one successful tool call) before tearing
// it down, precisely so a shim that was never really connected could not
// accidentally pass.
//
// Same seeding/isolation precedent `mcp-listener.spec.ts` and
// `mcp-round-trip.spec.ts` both establish: one throwaway `_electron.launch()`
// runs the forward-only migration, then `course-companion.db` is opened
// directly with `better-sqlite3` to seed a token hash, grants, and (unlike
// those two files) `mcp.tokenIssuedAt` — the ONE extra row this file needs,
// because `McpTokenCard`'s "Revocar" button is disabled while
// `status.tokenIssuedAt === null` (`McpTokenCard.tsx`), and this file drives
// that button for real.
//
// UI PATH CHOSEN over the `mcp:revokeToken`/`mcp:issueToken` IPC fallback:
// clicking through Ajustes exercises the full renderer -> IPC -> mcpService
// -> drain -> socket path a real student uses, which is the whole point of
// this file (task instruction: "drive it the way a person would"). The IPC
// channels were not invoked directly anywhere in this file.

const PROJECT_ROOT = path.join(__dirname, '..')
const SHIM_PATH = path.join(PROJECT_ROOT, 'out', 'mcp-shim', 'index.cjs')

const CONNECTION_CLOSED_MESSAGE = 'Connection closed by Course Companion\n'
const TOKEN_REJECTED_MESSAGE = 'Token rejected; issue a new one in Ajustes\n'

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
}

function testEndpoint(): string {
  const suffix = randomBytes(8).toString('hex')
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\course-companion-mcp-e2e-${suffix}`
    : path.join(os.tmpdir(), `course-companion-mcp-e2e-${suffix}.sock`)
}

function launchApp(userDataDir: string, endpoint: string) {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...inheritedEnv(), COURSE_COMPANION_MCP_ENDPOINT: endpoint }
  })
}

/**
 * Seeds a token hash, one grant, AND `mcp.tokenIssuedAt` — the third row is
 * this file's own addition over `mcp-round-trip.spec.ts`'s precedent,
 * required so the real "Revocar" button (`McpTokenCard.tsx`'s
 * `disabled={... || status.tokenIssuedAt === null}`) renders enabled without
 * this file ever issuing a token through the UI first.
 */
function seedTokenAndGrants(
  dbPath: string,
  token: string,
  grants: { slice: string; canRead: boolean; canWrite: boolean }[]
): void {
  const raw = new Database(dbPath)
  try {
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex')
    const nowIso = new Date().toISOString()
    raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('mcp.tokenHash', tokenHash)
    raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('mcp.tokenIssuedAt', nowIso)
    const insertGrant = raw.prepare(
      'INSERT INTO mcp_slice_permissions (slice, can_read, can_write, updated_at) VALUES (?, ?, ?, ?)'
    )
    for (const grant of grants) {
      insertGrant.run(grant.slice, grant.canRead ? 1 : 0, grant.canWrite ? 1 : 0, nowIso)
    }
  } finally {
    raw.close()
  }
}

interface SpawnedShim {
  child: ChildProcessWithoutNullStreams
  /**
   * Resolves once the process exits — subscribed EAGERLY, right here at
   * spawn time, not lazily when a test later decides to await it. Diagnosed
   * while writing this file: the whole point of these scenarios is a FAST
   * drain (design D8 ends an idle connection immediately, no hard-cap wait
   * needed), so the shim can exit before test code gets around to awaiting
   * it — a listener attached only later would silently miss an event that
   * already fired, since a Node `EventEmitter` never replays past events to
   * a listener added afterward. That was the true cause of this file's own
   * early failures, not a production defect: `'exit'` fired correctly and
   * promptly the whole time.
   */
  exited: Promise<number | null>
}

function spawnShim(endpoint: string, token: string | undefined): SpawnedShim {
  const env: Record<string, string> = { ...inheritedEnv(), COURSE_COMPANION_MCP_ENDPOINT: endpoint }
  if (token !== undefined) env.COURSE_COMPANION_MCP_TOKEN = token
  const child = spawn('node', [SHIM_PATH], { env })
  // Same safety net `mcp-round-trip.spec.ts` registers: writing to a dead
  // child's stdin after it already exited must not crash the TEST process.
  child.stdin.on('error', () => {})
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)))
  return { child, exited }
}

interface JsonRpcResponse {
  jsonrpc: string
  id?: number
  result?: { isError?: boolean }
  error?: { code: number; message: string }
}

/** Same wire-framing reader `mcp-round-trip.spec.ts` uses: splits on newlines, resolves waiters by response `id`, and keeps every raw line for the purity assertion. */
function captureJsonRpc(stdout: NodeJS.ReadableStream) {
  let tail = ''
  const lines: string[] = []
  const waiters = new Map<number, (message: JsonRpcResponse) => void>()

  stdout.on('data', (chunk: Buffer) => {
    tail += chunk.toString('utf8')
    let newlineIndex = tail.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = tail.slice(0, newlineIndex)
      tail = tail.slice(newlineIndex + 1)
      if (line.length > 0) {
        lines.push(line)
        try {
          const message = JSON.parse(line) as JsonRpcResponse
          if (typeof message.id === 'number') waiters.get(message.id)?.(message)
        } catch {
          // Left for `assertStdoutIsPureJsonRpc` to catch at the end.
        }
      }
      newlineIndex = tail.indexOf('\n')
    }
  })

  return {
    lines: () => lines,
    pendingTail: () => tail,
    waitForResponse(id: number, timeoutMs = 10_000): Promise<JsonRpcResponse> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for JSON-RPC response id=${id}`)), timeoutMs)
        waiters.set(id, (message) => {
          clearTimeout(timer)
          resolve(message)
        })
      })
    }
  }
}

type JsonRpcCapture = ReturnType<typeof captureJsonRpc>

function sendJsonRpc(child: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function collectStderr(child: ChildProcessWithoutNullStreams): () => string {
  const chunks: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
  return () => Buffer.concat(chunks).toString('utf8')
}

/** Same purity rule `mcp-round-trip.spec.ts` enforces: every non-empty stdout line parses as one complete JSON-RPC message, and nothing was left unterminated. */
function assertStdoutIsPureJsonRpc(capture: JsonRpcCapture): void {
  expect(capture.pendingTail()).toBe('')
  for (const line of capture.lines()) {
    const message = JSON.parse(line) as { jsonrpc?: string }
    expect(message.jsonrpc).toBe('2.0')
  }
}

function initializeAndProveLiveSession(
  shim: ChildProcessWithoutNullStreams,
  capture: JsonRpcCapture,
  clientName: string
) {
  return (async () => {
    sendJsonRpc(shim, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: clientName, version: '0.0.0' } }
    })
    const initializeResponse = await capture.waitForResponse(1)
    expect(initializeResponse.error).toBeUndefined()
    sendJsonRpc(shim, { jsonrpc: '2.0', method: 'notifications/initialized' })

    // The load-bearing precondition (task instruction): the session must be
    // GENUINELY authenticated and working before it is torn down, or this
    // whole file proves nothing. `materias_list` is read-only and granted
    // below.
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })
    const liveCallResponse = await capture.waitForResponse(2)
    expect(liveCallResponse.result?.isError).not.toBe(true)
  })()
}

test('the built shim used by these scenarios still has no code path to open the database itself', () => {
  // Same static, architectural proof `mcp-round-trip.spec.ts` establishes,
  // repeated here because THIS file's scenarios (revoke/rotate against a
  // live session) are exactly the ones where a broken implementation might
  // be tempted to add a fallback DB read — this makes the "never opens the
  // database" claim in this file's own assertions self-contained.
  const bundle = fs.readFileSync(SHIM_PATH, 'utf8')
  expect(bundle).not.toContain('better-sqlite3')
})

test('revoking the token through the real Ajustes UI terminates an already-authenticated, already-established live session — not merely refuses new connections', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-revoke-live-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const token = 'cc_e2e-revoke-live-session-token'
  const endpoint = testEndpoint()

  const migrating = await launchApp(userDataDir, testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  seedTokenAndGrants(dbPath, token, [{ slice: 'materias', canRead: true, canWrite: false }])

  const appProcess = await launchApp(userDataDir, endpoint)
  const { child: shim, exited } = spawnShim(endpoint, token)
  const capture = captureJsonRpc(shim.stdout)
  const stderr = collectStderr(shim)

  try {
    const window = await appProcess.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await initializeAndProveLiveSession(shim, capture, 'revoke-live-session-e2e')

    // Drive the real UI path: Ajustes -> the MCP connection card's "Revocar"
    // button, exactly what a student clicks.
    await window.getByRole('button', { name: 'Ajustes' }).click()
    await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

    // The MCP connection card sits behind the Integraciones tab since Ajustes
    // was split into three sections (approved `.pen`, node `PQXon`).
    await window.getByRole('button', { name: 'Integraciones' }).click()

    const revokeButton = window.getByRole('button', { name: 'Revocar', exact: true })
    await expect(revokeButton).toBeEnabled({ timeout: 20_000 })
    await revokeButton.click()

    // The button disabling itself (`status.tokenIssuedAt === null` once the
    // status query refetches after `mcp:revokeToken` resolves) is the UI's
    // own confirmation the revoke round trip completed — not a fixed sleep.
    await expect(revokeButton).toBeDisabled({ timeout: 20_000 })

    // The session established above is untouched by anything done so far
    // EXCEPT the revoke click. Attempt one more call on it: it must never be
    // answered, because the connection itself is gone, not merely refusing
    // new peers.
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })

    const NOTIFICATION_BUDGET_MS = 10_000
    const exitCode = await Promise.race([
      exited,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`shim was not terminated within ${NOTIFICATION_BUDGET_MS}ms of a real UI revoke`)),
          NOTIFICATION_BUDGET_MS
        )
      )
    ])

    expect(exitCode).toBe(1)
    expect(stderr()).toBe(CONNECTION_CLOSED_MESSAGE)
    // id=3 was never answered: the terminal failure the client observes IS
    // the transport dying, exactly like the mid-session app-quit scenario —
    // no reconnect, no queued retry, no stray success on a revoked session.
    expect(capture.lines().some((line) => (JSON.parse(line) as JsonRpcResponse).id === 3)).toBe(false)
    assertStdoutIsPureJsonRpc(capture)
  } finally {
    if (shim.exitCode === null) shim.kill()
    await appProcess.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('rotating the token through the real Ajustes UI terminates the established session, and the OLD token stops authenticating a fresh connection', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-rotate-live-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const oldToken = 'cc_e2e-rotate-live-session-old-token'
  const endpoint = testEndpoint()

  const migrating = await launchApp(userDataDir, testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  seedTokenAndGrants(dbPath, oldToken, [{ slice: 'materias', canRead: true, canWrite: false }])

  const appProcess = await launchApp(userDataDir, endpoint)
  const { child: shim, exited } = spawnShim(endpoint, oldToken)
  const capture = captureJsonRpc(shim.stdout)
  const stderr = collectStderr(shim)

  try {
    const window = await appProcess.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await initializeAndProveLiveSession(shim, capture, 'rotate-live-session-e2a')

    await window.getByRole('button', { name: 'Ajustes' }).click()
    await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

    await window.getByRole('button', { name: 'Integraciones' }).click()

    const rotateButton = window.getByRole('button', { name: 'Rotar', exact: true })
    await rotateButton.click()

    // The plaintext-token warning box only renders once `issuedMcpToken` is
    // set (`AjustesContainer.tsx`'s `mcpRotateMutation.onSuccess`) — real
    // confirmation a NEW token was actually issued, not a fixed sleep.
    await expect(window.getByText('Se muestra una sola vez', { exact: false })).toBeVisible({ timeout: 20_000 })

    // Same shape as the revoke test above: the session established with the
    // OLD token, still open, must die — an in-flight-less connection is
    // ended right away by the very same drain mechanism (design D8).
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })

    const NOTIFICATION_BUDGET_MS = 10_000
    const exitCode = await Promise.race([
      exited,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`shim was not terminated within ${NOTIFICATION_BUDGET_MS}ms of a real UI rotate`)),
          NOTIFICATION_BUDGET_MS
        )
      )
    ])

    expect(exitCode).toBe(1)
    expect(stderr()).toBe(CONNECTION_CLOSED_MESSAGE)
    expect(capture.lines().some((line) => (JSON.parse(line) as JsonRpcResponse).id === 3)).toBe(false)
    assertStdoutIsPureJsonRpc(capture)

    // The addition the task instructions call for beyond "the connection
    // died": a FRESH connection presenting the OLD token must also be
    // rejected — this is a genuinely new e2e assertion, since every existing
    // e2e negative case (`mcp-round-trip.spec.ts`) only ever tries a token
    // that was NEVER valid, never one that WAS valid and got rotated away.
    const { child: staleShim, exited: staleExited } = spawnShim(endpoint, oldToken)
    const staleCapture = captureJsonRpc(staleShim.stdout)
    const staleStderr = collectStderr(staleShim)
    try {
      const staleExitCode = await staleExited
      expect(staleExitCode).toBe(1)
      expect(staleCapture.lines()).toHaveLength(0)
      expect(staleStderr()).toBe(TOKEN_REJECTED_MESSAGE)
    } finally {
      if (staleShim.exitCode === null) staleShim.kill()
    }
  } finally {
    if (shim.exitCode === null) shim.kill()
    await appProcess.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
