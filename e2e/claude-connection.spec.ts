import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// The ONLY place in this entire change where a real `claude` binary is spawned
// end to end (every other layer injects doubles). Proves the full chain:
// resolver -> validator -> probe service -> IPC -> preload -> AjustesContainer
// -> ConnectionStatusCard, against the ACTUAL machine.
//
// It also proves the OPT-IN gate against the real app rather than against a
// mocked query client: opening Ajustes must spawn nothing, and only pressing
// this CLI's own "Conectar" may start a process.
//
// Verified environment (spec "Version parses -> connected"): `where claude`
// resolves both `C:\nvm4w\nodejs\claude` (extension-less POSIX script) and
// `C:\nvm4w\nodejs\claude.cmd` (batch shim); `claude --version` prints
// `2.1.220 (Claude Code)`. Design D1 requires the resolver to select the
// `.cmd` shim — the extension-less script has no PATHEXT extension and is
// naturally excluded on win32.
//
// Same `_electron` + real packaged-build launch shape as `hoy-export.spec.ts`
// — `electron .` from the project root, isolated `--user-data-dir`,
// `npm run build` already ran via the `test:e2e` script.

test('launch -> nothing probed until Conectar -> real probe connects -> the opt-in survives a restart', async () => {
  const projectRoot = path.join(__dirname, '..')
  // ONE data directory across BOTH launches: the opt-in is persisted in the
  // sqlite settings table, so a fresh directory per launch would prove nothing.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-claude-'))
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })

  try {
    const first = await launch()
    try {
      const window = await first.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Hoy renders by default (spec: "Today view on launch") — navigate to
      // the sixth nav item.
      await window.getByRole('button', { name: 'Ajustes' }).click()
      await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

      // The opt-in gate, against the real app: every CLI sits idle and no
      // status has been claimed, because no probe ran. `claude` IS installed on
      // this machine, so a "Conectado" here would mean the screen probed on its
      // own.
      await expect(window.getByRole('button', { name: 'Conectar Claude Code', exact: true })).toBeVisible()
      await expect(window.getByText('Conectado')).toHaveCount(0)

      await window.getByRole('button', { name: 'Conectar Claude Code', exact: true }).click()

      // Real spawn round-trip: resolver finds `claude.cmd` on PATH, the
      // validator clears it, the probe service spawns `claude --version` via
      // the cmd.exe vector (D2), and the status settles to `connected`.
      //
      // "Conectado" is the whole assertion now that the row is one line — the
      // probe service returns it ONLY when a version actually parsed out of a
      // validated executable's stdout, so it carries what the version and path
      // rows used to assert separately.
      await expect(window.getByText('Conectado')).toBeVisible({ timeout: 20_000 })

      // Connecting one CLI must not have started the other two.
      await expect(window.getByRole('button', { name: 'Conectar Antigravity CLI', exact: true })).toBeVisible()
      await expect(window.getByRole('button', { name: 'Conectar Codex CLI', exact: true })).toBeVisible()
    } finally {
      await first.close()
    }

    // The whole point of persisting it: the student made this decision once.
    const second = await launch()
    try {
      const window = await second.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      await window.getByRole('button', { name: 'Ajustes' }).click()
      await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

      // `exact` is load-bearing: Playwright matches an accessible name by
      // SUBSTRING, and the connected row's "Desconectar Claude Code" contains
      // "Conectar Claude Code" — without it this assertion passes on a row that
      // reconnected perfectly.
      // No click this time. Claude re-probes because it was connected before;
      // the other two stay idle, which is what keeps persistence from quietly
      // becoming "probe everything on open".
      await expect(window.getByText('Conectado')).toBeVisible({ timeout: 20_000 })
      await expect(window.getByRole('button', { name: 'Conectar Claude Code', exact: true })).toHaveCount(0)
      await expect(window.getByRole('button', { name: 'Conectar Codex CLI', exact: true })).toBeVisible()
    } finally {
      await second.close()
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
