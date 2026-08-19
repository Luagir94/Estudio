import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Task 7.7 — the ONLY place in this entire change where a real `claude`
// binary is spawned end to end (every other layer injects doubles). Proves
// the full chain: resolver -> validator -> probe service -> IPC -> preload
// -> AjustesContainer -> ConnectionStatusCard, against the ACTUAL machine.
//
// Verified environment (spec "Version parses -> connected"): `where claude`
// resolves both `C:\nvm4w\nodejs\claude` (extension-less POSIX script) and
// `C:\nvm4w\nodejs\claude.cmd` (batch shim); `claude --version` prints
// `2.1.220 (Claude Code)`. Design D1 requires the resolver to select the
// `.cmd` shim — the extension-less script has no PATHEXT extension and is
// naturally excluded on win32.
//
// Same `_electron` + real packaged-build launch shape as `hoy-export.spec.ts`
// (task 6.8's precedent) — `electron .` from the project root, isolated
// `--user-data-dir`, `npm run build` already ran via the `test:e2e` script.

test('launch -> open Ajustes -> real probe resolves to connected with version and path', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-claude-'))

  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Hoy renders by default (spec: "Today view on launch") — navigate to
    // the new sixth nav item.
    await window.getByRole('button', { name: 'Ajustes' }).click()

    await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

    // Real spawn round-trip: resolver finds `claude.cmd` on PATH, the
    // validator clears it, the probe service spawns `claude --version` via
    // the cmd.exe vector (D2), and the status settles to `connected`.
    await expect(window.getByText('Conectado')).toBeVisible({ timeout: 20_000 })
    await expect(window.getByText('2.1.220')).toBeVisible()
    await expect(window.getByText(/claude\.cmd$/)).toBeVisible()
  } finally {
    await electronApp.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
