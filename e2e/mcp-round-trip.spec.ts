import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test } from '@playwright/test'

// Tasks 13.1-13.2 — the ONE spec that proves the whole path end to end: an
// external process spawns the shim with SYSTEM Node (never Electron's own),
// the shim reaches the running app over the internal leg, and real MCP
// traffic flows both ways. Everything through PR12 proved a piece in
// isolation (`mcp-listener.spec.ts` proved only the listener's start/stop
// DECISION, never a handshake or a tool call — see its own header comment);
// this file is the first to drive an actual `initialize` -> `tools/list` ->
// `tools/call` session through the real built `out/mcp-shim/index.cjs`.
//
// Same seeding precedent `mcp-listener.spec.ts` and `ask-my-materials.spec.ts`
// established: the token-issuing UI does not exist until PR15, so a
// throwaway `_electron.launch()` runs the forward-only migration, then
// `course-companion.db` is opened directly with `better-sqlite3` to write a
// token hash and slice grants by hand.
//
// ISOLATION: every launch passes its own random `COURSE_COMPANION_MCP_ENDPOINT`
// through `electron.launch({ env })`, and the SAME value is handed to the
// spawned shim's env so both ends meet on a pipe no real instance holds —
// the endpoint derives from `sha256(username)`, never from
// `--user-data-dir`, so an isolated user-data-dir alone would NOT isolate it
// (the exact lesson `ask-my-materials.spec.ts` paid for with a stale
// `~/.claude.json` read before `eedf12e`). No file here reads outside a
// directory it created itself.

const PROJECT_ROOT = path.join(__dirname, '..')
const SHIM_PATH = path.join(PROJECT_ROOT, 'out', 'mcp-shim', 'index.cjs')

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

/** Writes a token hash (SHA-256, same algorithm `domain/token.ts#hashToken` and the wire `parseHello` both use) and one row per grant, straight into the schema `mcp-listener.spec.ts` already seeds this exact way. */
function seedTokenAndGrants(
  dbPath: string,
  token: string,
  grants: { slice: string; canRead: boolean; canWrite: boolean }[]
): void {
  const raw = new Database(dbPath)
  try {
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex')
    raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('mcp.tokenHash', tokenHash)
    const insertGrant = raw.prepare(
      'INSERT INTO mcp_slice_permissions (slice, can_read, can_write, updated_at) VALUES (?, ?, ?, ?)'
    )
    for (const grant of grants) {
      insertGrant.run(grant.slice, grant.canRead ? 1 : 0, grant.canWrite ? 1 : 0, new Date().toISOString())
    }
  } finally {
    raw.close()
  }
}

function spawnShim(endpoint: string, token: string | undefined): ChildProcessWithoutNullStreams {
  const env: Record<string, string> = { ...inheritedEnv(), COURSE_COMPANION_MCP_ENDPOINT: endpoint }
  if (token !== undefined) env.COURSE_COMPANION_MCP_TOKEN = token
  const child = spawn('node', [SHIM_PATH], { env })
  // Writing to a dead child's stdin (e.g. after it already exited) would
  // otherwise emit an unhandled 'error' (EPIPE) that crashes the TEST
  // process, not the shim — every test below only cares about the shim's
  // OWN exit code and stderr, so this is a safety net, not an assertion.
  child.stdin.on('error', () => {})
  return child
}

interface JsonRpcResponse {
  jsonrpc: string
  id?: number
  result?: { content?: { type: string; text: string }[]; isError?: boolean }
  error?: { code: number; message: string }
}

/** Reads raw stdout, splitting on newlines exactly like the SDK's own wire framing, and hands out promises resolved by response `id` — while keeping every raw line for the purity assertion (task 13.1). */
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
          // Left for `assertStdoutIsPureJsonRpc` at the end of the test to
          // catch — a reader that throws mid-session would hide exactly the
          // failure this whole spec exists to find.
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

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  return new Promise((resolve) => child.once('close', (code) => resolve(code)))
}

function collectStderr(child: ChildProcessWithoutNullStreams): () => string {
  const chunks: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
  return () => Buffer.concat(chunks).toString('utf8')
}

/**
 * The load-bearing MCP spec rule (task 13.1): "The server MUST NOT write
 * anything to its stdout that is not a valid MCP message." Every non-empty
 * line must `JSON.parse` and carry `jsonrpc: '2.0'`; `pendingTail` must be
 * empty too, or some byte never made it into a newline-terminated line at
 * all (which the SDK's own `ReadBuffer` would never emit for, but a stray
 * shim `console.log`/`process.stdout.write` without a trailing `\n` could).
 */
function assertStdoutIsPureJsonRpc(capture: JsonRpcCapture): void {
  expect(capture.pendingTail()).toBe('')
  const lines = capture.lines()
  expect(lines.length).toBeGreaterThan(0)
  for (const line of lines) {
    const message = JSON.parse(line) as { jsonrpc?: string }
    expect(message.jsonrpc).toBe('2.0')
  }
}

function toolResultPayload(response: JsonRpcResponse): unknown {
  const text = response.result?.content?.[0]?.text
  if (text === undefined) throw new Error(`Response ${JSON.stringify(response)} carried no text content`)
  return JSON.parse(text)
}

test('the built shim artifact never references better-sqlite3 — it has no code path to open the database itself', () => {
  // Static, architectural proof of the spec's "MUST NOT open the database
  // itself under any circumstance": the real built artifact (produced by
  // `npm run build`, which `test:e2e` always runs first per PR12's B1 fix)
  // does not even contain the string, so no runtime branch could reach it —
  // this is stronger than any behavioral check could be on its own.
  const bundle = fs.readFileSync(SHIM_PATH, 'utf8')
  expect(bundle).not.toContain('better-sqlite3')
})

test('the shim fails closed when the app is not running (ENOENT)', async () => {
  // No app launch at all: the endpoint below has never been listened on by
  // anything, in this process or any other — the same signal design D1
  // calls out as unambiguous (`ENOENT`/`ECONNREFUSED`), and the one PR12's
  // own real-build proof already exercised manually against this exact
  // message before any e2e spec existed for it.
  const shim = spawnShim(testEndpoint(), 'cc_irrelevant-since-nothing-is-listening')
  const capture = captureJsonRpc(shim.stdout)
  const stderr = collectStderr(shim)

  const exitCode = await waitForExit(shim)

  expect(exitCode).toBe(1)
  expect(capture.lines()).toHaveLength(0)
  expect(capture.pendingTail()).toBe('')
  expect(stderr()).toBe(
    'Course Companion is not running, or MCP is not enabled in Ajustes (no token issued or no slice granted).\n'
  )
})

test('round trip: initialize -> tools/list -> tools/call over the real shim, rejecting a missing or wrong token before any dispatch, keeping stdout pure under load', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-round-trip-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const token = 'cc_e2e-round-trip-real-token'
  const endpoint = testEndpoint()

  // One throwaway launch to run the forward-only migration, so there is a
  // schema to seed the token/grants into (same precedent `mcp-listener.spec.ts`
  // and `ask-my-materials.spec.ts` both follow).
  const migrating = await launchApp(userDataDir, testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  // materias/horario read-only, carreras write-only — deliberately shaped so
  // the SAME running app can prove a success path (materias, horario), a
  // permission denial (carreras read, never granted), AND the tool wrapper's
  // OWN second full-schema parse (carreras write IS granted, so
  // `carreras_create_period` reaches `mcpServerFactory`'s double parse and
  // fails there on an object-level `.refine` the SDK's own raw-shape
  // validation would have already dropped — design's documented reason that
  // second parse exists at all).
  seedTokenAndGrants(dbPath, token, [
    { slice: 'materias', canRead: true, canWrite: false },
    { slice: 'horario', canRead: true, canWrite: false },
    { slice: 'carreras', canRead: false, canWrite: true }
  ])

  const appProcess = await launchApp(userDataDir, endpoint)
  try {
    await (await appProcess.firstWindow()).waitForLoadState('domcontentloaded')

    // --- Negative case: a missing or wrong token is rejected at handshake,
    // before a single tool call can reach the server (spec "Handshake
    // rejects a missing or wrong token before dispatch"). ---
    for (const badToken of [undefined, 'cc_this-is-not-the-real-token']) {
      const shim = spawnShim(endpoint, badToken)
      const capture = captureJsonRpc(shim.stdout)
      const stderr = collectStderr(shim)

      const exitCode = await waitForExit(shim)

      expect(exitCode).toBe(1)
      expect(capture.lines()).toHaveLength(0)
      expect(stderr()).toBe('Token rejected; issue a new one in Ajustes\n')
    }

    // --- The real round trip. ---
    const shim = spawnShim(endpoint, token)
    const capture = captureJsonRpc(shim.stdout)
    const stderr = collectStderr(shim)

    sendJsonRpc(shim, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'mcp-round-trip-e2e', version: '0.0.0' }
      }
    })
    const initializeResponse = await capture.waitForResponse(1)
    expect(initializeResponse.result).toBeTruthy()
    expect(initializeResponse.error).toBeUndefined()

    sendJsonRpc(shim, { jsonrpc: '2.0', method: 'notifications/initialized' })

    sendJsonRpc(shim, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const toolsListResponse = await capture.waitForResponse(2)
    const tools = (toolsListResponse.result as unknown as { tools: { name: string }[] }).tools
    expect(tools).toHaveLength(32)

    // "Prove it under load, not on a single request — a debug line that only
    // appears on the tenth call is exactly the bug this catches." Sixteen
    // calls, cycling four distinct code paths (two successes, one denial,
    // one validation failure), sent all at once rather than one at a time.
    const VARIANTS = ['horario_week', 'materias_list', 'carreras_list', 'carreras_create_period'] as const
    const CALLS_UNDER_LOAD = 16
    const calls = Array.from({ length: CALLS_UNDER_LOAD }, (_, i) => ({
      id: 100 + i,
      name: VARIANTS[i % VARIANTS.length]
    }))

    const badPeriodArgs = {
      programId: 1,
      name: 'Spike period',
      kind: 'cuatrimestre',
      startsOn: '2026-03-01',
      // Before startsOn: passes the SDK's own raw-shape check (no refine on
      // the rebuilt shape) but fails `mcpServerFactory`'s second full parse.
      endsOn: '2026-01-01'
    }

    const responses = await Promise.all(
      calls.map((call) => {
        const args = call.name === 'carreras_create_period' ? badPeriodArgs : {}
        sendJsonRpc(shim, {
          jsonrpc: '2.0',
          id: call.id,
          method: 'tools/call',
          params: { name: call.name, arguments: args }
        })
        return capture.waitForResponse(call.id).then((response) => ({ ...call, response }))
      })
    )

    for (const { name, response } of responses) {
      expect(response.error).toBeUndefined()
      const payload = toolResultPayload(response) as { code?: string; message?: string }
      if (name === 'horario_week' || name === 'materias_list') {
        expect(response.result?.isError).not.toBe(true)
      } else if (name === 'carreras_list') {
        expect(response.result?.isError).toBe(true)
        expect(payload.code).toBe('PERMISSION_DENIED')
      } else {
        expect(response.result?.isError).toBe(true)
        expect(payload.code).toBe('VALIDATION_ERROR')
        expect(payload.message).toContain('period.endBeforeStart')
      }
    }

    shim.stdin.end()
    expect(await waitForExit(shim)).toBe(0)

    assertStdoutIsPureJsonRpc(capture)
    expect(stderr()).toBe('')
  } finally {
    await appProcess.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('the shim reports a terminal failure to the client, and never opens the database itself, when the app quits mid-session', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-mid-quit-'))
  const token = 'cc_e2e-mid-session-quit-token'
  const endpoint = testEndpoint()

  const migrating = await launchApp(userDataDir, testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  seedTokenAndGrants(path.join(userDataDir, 'course-companion.db'), token, [
    { slice: 'materias', canRead: true, canWrite: false }
  ])

  const appProcess = await launchApp(userDataDir, endpoint)
  const shim = spawnShim(endpoint, token)
  const capture = captureJsonRpc(shim.stdout)
  const stderr = collectStderr(shim)

  try {
    await (await appProcess.firstWindow()).waitForLoadState('domcontentloaded')

    sendJsonRpc(shim, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'mid-quit-e2e', version: '0.0.0' }
      }
    })
    await capture.waitForResponse(1)
    sendJsonRpc(shim, { jsonrpc: '2.0', method: 'notifications/initialized' })

    // Prove the session is genuinely live before killing the app — a
    // terminal failure on a connection that was never really established
    // would not prove the "mid-session" scenario at all.
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })
    const liveCallResponse = await capture.waitForResponse(2)
    expect(liveCallResponse.result?.isError).not.toBe(true)

    // Hard-kill the app process (a `taskkill /F`, not Playwright's own
    // graceful `.close()`) — deliberately, not merely for speed. Empirically
    // confirmed while writing this spec: a GRACEFUL `app.quit()` (which is
    // all `.close()` drives) leaves the shim's socket without any 'error'/
    // 'close' notification for well over 45s on this platform, even though
    // the main process has genuinely and fully exited (`process.on('exit')`
    // fires, code 0, no lingering process of any kind) — `will-quit`
    // (`src/main/index.ts`) only calls `mcpListener.close()`, which stops
    // the LISTENER but never proactively drains already-open connections
    // the way token rotate/revoke do (design D8); it relies entirely on the
    // OS reclaiming the pipe handle on process death, and that reclamation
    // is not prompt for a graceful Electron quit on this platform. A hard
    // kill is both the faster AND the more realistic simulation of "the app
    // process quits" (spec's own wording covers a crash, not only a clean
    // exit) — flagged as a real gap for the maintainer in this PR's report,
    // not fixed here (out of this PR's scope).
    const underlyingProcess = appProcess.process()
    execSync(`taskkill /F /T /PID ${underlyingProcess.pid}`)

    // A call attempted while disconnected must fail immediately rather than
    // being queued or silently retried (spec "Calls during disconnection are
    // rejected, not queued"): once the shim's own process exits below, this
    // write reaches a dead transport and can never be answered — there is no
    // reconnect-and-replay path anywhere in `relay.ts`.
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })

    const exitCode = await waitForExit(shim)

    expect(exitCode).toBe(1)
    expect(stderr()).toBe('Connection closed by Course Companion\n')
    // id=3 was never answered — the terminal failure the client observes IS
    // the transport dying, not a JSON-RPC-level error message.
    expect(capture.lines().some((line) => (JSON.parse(line) as JsonRpcResponse).id === 3)).toBe(false)

    // Everything captured (the one successful call, nothing past the quit)
    // still parses clean — a mid-session failure must not corrupt whatever
    // was already written.
    assertStdoutIsPureJsonRpc(capture)
  } finally {
    if (shim.exitCode === null) shim.kill()
    await appProcess.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('the shim is notified promptly when the app quits gracefully (defect fix PR11b)', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-mcp-graceful-quit-'))
  const token = 'cc_e2e-graceful-quit-token'
  const endpoint = testEndpoint()

  const migrating = await launchApp(userDataDir, testEndpoint())
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  seedTokenAndGrants(path.join(userDataDir, 'course-companion.db'), token, [
    { slice: 'materias', canRead: true, canWrite: false }
  ])

  const appProcess = await launchApp(userDataDir, endpoint)
  const shim = spawnShim(endpoint, token)
  const capture = captureJsonRpc(shim.stdout)
  const stderr = collectStderr(shim)

  try {
    await (await appProcess.firstWindow()).waitForLoadState('domcontentloaded')

    sendJsonRpc(shim, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'graceful-quit-e2e', version: '0.0.0' }
      }
    })
    await capture.waitForResponse(1)
    sendJsonRpc(shim, { jsonrpc: '2.0', method: 'notifications/initialized' })

    // Prove the session is genuinely live before quitting — same reasoning
    // as the mid-quit test above.
    sendJsonRpc(shim, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'materias_list', arguments: {} } })
    const liveCallResponse = await capture.waitForResponse(2)
    expect(liveCallResponse.result?.isError).not.toBe(true)

    // GRACEFUL quit this time — Playwright's own `.close()`, which drives a
    // real `app.quit()`. This is deliberately NOT `taskkill` (unlike the
    // mid-quit test above, which simulates a crash on purpose): PR13
    // reported that, before this fix, a graceful quit left the shim's
    // socket with no 'error'/'close' notification for 45+ seconds, because
    // the old `will-quit` hook only closed the LISTENER and never drained
    // the already-open connection the way token rotate/revoke already did
    // (design D8's drain, reused here by `mcpService.shutdown()`, called
    // from `before-quit` — see `src/main/index.ts`'s own comment for why it
    // cannot be `will-quit`).
    //
    // Honesty note (PR11b): re-measuring on THIS machine/session, repeated
    // runs against the PRE-fix code (`mcpListener.close()` only) also
    // disconnected fast (~100-130ms) — the original 45+ second gap did not
    // reproduce here, so this assertion cannot be shown to fail without the
    // fix in this environment. It is kept anyway as a spec-compliance
    // guard for the target behavior (exit 1, exact terminal-failure stderr,
    // prompt notification) and as a permanent regression net should the
    // platform-dependent stall PR13 observed recur; `QUIT_DRAIN_CAP_MS`
    // (mcpService.ts) is the fix's own upper bound, so the budget below
    // stays generous over it rather than over the unreproduced 45s figure.
    const quitStartedAt = Date.now()
    const closePromise = appProcess.close()

    const NOTIFICATION_BUDGET_MS = 5_000
    const exitCode = await Promise.race([
      waitForExit(shim),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`shim was not notified within ${NOTIFICATION_BUDGET_MS}ms of a graceful app quit`)),
          NOTIFICATION_BUDGET_MS
        )
      )
    ])
    const latencyMs = Date.now() - quitStartedAt

    expect(exitCode).toBe(1)
    expect(stderr()).toBe('Connection closed by Course Companion\n')
    expect(latencyMs).toBeLessThan(NOTIFICATION_BUDGET_MS)

    await closePromise
  } finally {
    if (shim.exitCode === null) shim.kill()
    await appProcess.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
