import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// The ONLY place this change proves the whole restore-on-launch chain end to
// end: main persisting `did-navigate-in-page` -> `app_settings['app.lastRoute']`
// -> the NEXT launch seeding it as the document hash BEFORE the renderer
// boots -> `@tanstack/history` stamping `__TSR_index: 0` onto that entry, so
// `useCanGoBack()` reads false and the first Back never lands on an unvisited
// screen. Every layer below this has a double: `launchRoute.test.ts` and
// `lastRouteService.test.ts` prove the pure logic against a fake settings
// port, never against a real Electron boot. Same `_electron` + isolated
// `--user-data-dir` shape as `palette-preference.spec.ts` and
// `ask-history-persistence.spec.ts`.
//
// The persisted route is plain `/materias`, not `/materias?filtro=aprobadas`
// as the design's own testing table sketches: driving the "Aprobadas" chip
// against the REAL app (not a mocked container) surfaces a pre-existing PR1
// defect — `MateriasListContainer`'s `useOptionalControlled(controlledFilter,
// onFilterChange, 'activas')` treats an initial `undefined` `filter` prop as
// UNCONTROLLED regardless of whether `onFilterChange` is also given, so the
// first click only updates local state and the address never gains
// `?filtro=`. `CarreraDetailContainer.tsx` shares the exact same call shape
// and is presumably affected the same way. This is called out as a risk in
// the apply-progress rather than silently worked around: it is a real,
// pre-existing bug outside PR3's assigned scope (main-only), not something
// this PR introduced or is responsible for fixing.

test('a route visited before quitting is restored at history index 0 on relaunch, with no spurious back target', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-launch-route-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })

  try {
    const first = await launch()
    try {
      const window = await first.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      await expect(window.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })

      await window.getByRole('button', { name: 'Materias' }).click()
      await expect(window.getByRole('heading', { name: 'Materias' })).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => window.evaluate(() => location.hash)).toBe('#/materias')

      // `did-navigate-in-page` must have already persisted this hop — closing
      // the window is what would otherwise race the write.
      await expect
        .poll(() => {
          const db = new Database(dbPath, { readonly: true })
          try {
            return db.prepare("SELECT value FROM app_settings WHERE key = 'app.lastRoute'").get()?.value
          } finally {
            db.close()
          }
        })
        .toBe('/materias')
    } finally {
      await first.close()
    }

    const second = await launch()
    try {
      const window = await second.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Restored, not navigated to: the hash is present on the FIRST paint.
      await expect(window.getByRole('heading', { name: 'Materias' })).toBeVisible({ timeout: 20_000 })
      expect(await window.evaluate(() => location.hash)).toBe('#/materias')

      // THE assertion only a real boot can make: index 0, so there is no
      // history entry above this one — canGoBack() is false at launch.
      expect(await window.evaluate(() => (history.state as { __TSR_index: number }).__TSR_index)).toBe(0)

      // A `history.back()` here must be a no-op — proves the restored entry
      // is not sitting on top of an unvisited screen (Hoy) the way a
      // post-boot `navigate()` would have left it.
      await window.evaluate(() => history.back())
      await window.waitForTimeout(200)
      expect(await window.evaluate(() => location.hash)).toBe('#/materias')
      await expect(window.getByRole('heading', { name: 'Materias' })).toBeVisible()

      // G1 end to end (design "Testing Strategy"): from here, a real
      // navigation followed by a real `history.back()` under `file://` must
      // resolve to the actual prior screen.
      await window.getByRole('button', { name: 'Hoy' }).click()
      await expect(window.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })

      await window.getByRole('button', { name: 'Horario' }).click()
      await expect(window.getByRole('heading', { name: 'Horario semanal' })).toBeVisible({ timeout: 20_000 })

      await window.evaluate(() => history.back())
      await expect(window.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })
    } finally {
      await second.close()
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Task 3.9: an invalid persisted route must never crash the launch or strand
// the user on a dead screen. The router's OWN existing guard for this is
// `NotFoundRedirect` (`router.tsx`) — any hash that matches no route in the
// tree resolves to `/hoy` via a `replace` navigate in an effect, so index
// stays 0 (design D7 / Failure Handling: "Stored hash is an unknown route ->
// NotFoundRedirect replace -> /hoy, index 0"). Main only validates the hash
// SYNTACTICALLY (`launchRoute.ts`); it never learns a route name, so this is
// exactly the shape main hands the renderer for a since-removed route or an
// old build's stale address.
//
// A syntactically valid `/materias/$id` pointing at a since-DELETED subject
// is a distinct case the router does not currently redirect at all — per the
// design's own Failure Handling table, a deleted subject reached this way
// renders the existing inline `loadError` state rather than bouncing to
// `/hoy`. That gap is outside PR3's scope (main-only, no router changes) and
// is called out in the apply-progress deviations rather than silently papered
// over here.
test('an unknown persisted route falls back to /hoy at history index 0', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-launch-route-invalid-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')

  // First launch: runs the forward-only migration, creating the schema —
  // and, since it boots to `/hoy`, also writes the FIRST `app.lastRoute` row.
  const bootstrapLaunch = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })
  const bootstrapWindow = await bootstrapLaunch.firstWindow()
  await bootstrapWindow.waitForLoadState('domcontentloaded')
  await expect(bootstrapWindow.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })
  await bootstrapLaunch.close()

  // Overwrite it with a syntactically valid but unknown route — no route in
  // the tree owns `/no-such-screen`.
  const raw = new Database(dbPath)
  try {
    raw
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES ('app.lastRoute', '/no-such-screen') " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run()
  } finally {
    raw.close()
  }

  const relaunch = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })
  try {
    const window = await relaunch.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Never a crash and never stranded on the dead hash.
    await expect(window.getByRole('heading', { name: 'CLASES DE HOY' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => window.evaluate(() => location.hash)).toBe('#/hoy')
    expect(await window.evaluate(() => (history.state as { __TSR_index: number }).__TSR_index)).toBe(0)
  } finally {
    await relaunch.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
