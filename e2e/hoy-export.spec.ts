import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// First Playwright test in the repo (task 6.8). Drives the REAL packaged
// production build via Electron's `_electron` fixture — not jsdom, not the
// Vite dev server. Requires `npm run build` to have produced `out/` first
// (see the `test:e2e` package.json script, which chains the build).
//
// `--user-data-dir` is a standard Chromium/Electron switch, parsed from
// argv before `app.whenReady()` — it isolates this run's SQLite database
// (and any exported file) into a throwaway temp directory, never touching
// a real dev/user profile.
//
// Launched as `electron .` (project root), NOT `electron out/main/index.js`
// directly — `getMigrationsFolder()` resolves `drizzle/migrations` relative
// to `app.getAppPath()`, which Electron only anchors at the project root
// (where package.json's `main` field lives) when given the directory, not
// when handed the built script path directly. Same launch shape every
// prior slice's manual runtime harness used (`electron .`).

test('launch -> Hoy renders with zero navigation -> export produces a real file', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-'))
  const exportPath = path.join(userDataDir, 'course-companion-export.json')

  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // spec: "Today view on launch" — Hoy renders on launch, zero clicks.
    await expect(window.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })
    await expect(window.getByRole('heading', { name: 'PRÓXIMOS 7 DÍAS' })).toBeVisible()
    await expect(window.getByRole('heading', { name: 'ESTA SEMANA' })).toBeVisible()

    // Playwright cannot drive a native OS save dialog — stub main's dialog
    // module for this run only, same pattern any Electron+Playwright suite
    // uses. The renderer-side flow (button click -> IPC -> write) is real.
    await electronApp.evaluate(async ({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog
    }, exportPath)

    await window.getByRole('button', { name: 'Exportar datos' }).click()

    await expect
      .poll(() => fs.existsSync(exportPath), { timeout: 10_000, message: 'exported file never appeared on disk' })
      .toBe(true)

    const snapshot = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
    expect(snapshot).toHaveProperty('subjects')
    expect(snapshot).toHaveProperty('deadlines')
    // Local-naive datetime, never toISOString() (design §3a).
    expect(snapshot.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  } finally {
    await electronApp.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
