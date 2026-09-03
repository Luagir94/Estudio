import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test } from '@playwright/test'

// Task 5.8 — the ask panel against the REAL app: real preload bridge, real
// IPC, real main-process service, real repositories. Same `_electron` +
// isolated `--user-data-dir` launch shape as `claude-connection.spec.ts`.
//
// WHAT THIS COVERS: the panel is mounted globally — it is reachable from the
// default Hoy screen, which is not its own domain — and its shell is wired:
// model picker, composer, cost disclaimer, close, and the ephemeral discard.
//
// WHAT THIS DELIBERATELY DOES NOT DO: send a question. There is no longer an
// empty-corpus gate, so any question here would reach the REAL `claude` CLI
// and spend the user's own usage on every single test run. A suite that
// quietly bills the person running it is not a suite anyone can run freely,
// so the round trip stays a manual check.
//
// The OPT-IN is seeded straight into the settings table rather than clicked
// through Ajustes, and that is the same boundary again: pressing "Conectar"
// spawns a real `claude --version`, so seeding the row that press would have
// written keeps this file spawning nothing while still exercising a panel the
// student is allowed to use.
//
// The consequence is stated plainly: no automated test exercises a real
// spawn. Everything below the IPC boundary is covered by unit tests with an
// injected spawn double, and the spawn itself is verified by hand.

test('launch -> open the ask panel from Hoy -> the shell is wired and closes cleanly', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-ask-'))

  // A HOME of its own, and it is the height assertion below that needs it.
  // Model discovery reads each CLI's per-user state file relative to the HOME
  // directory, never to `--user-data-dir`, so an isolated user-data-dir does
  // not isolate the menu: it is built from whatever the developer running the
  // suite happens to have configured. Seeding a home of our own is what makes
  // the row count the same on every machine.
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-ask-home-'))
  fs.writeFileSync(
    path.join(homeDir, '.claude.json'),
    JSON.stringify({
      // Server-granted options, the first evidence source the parser reads.
      // Enough of them that the list is certain to outgrow its 360px cap —
      // the baseline five alone never do, which is exactly how this assertion
      // came to pass on one machine and fail on the next.
      additionalModelOptionsCache: [
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-1-20250805',
        'claude-haiku-3-5-20241022',
        'claude-sonnet-3-7-20250219',
        'claude-opus-4-20250514',
        'claude-haiku-4-20250601'
      ].map((value) => ({ value }))
    })
  )
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const launch = () =>
    electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: projectRoot,
      env: { ...inheritedEnv, USERPROFILE: homeDir, HOME: homeDir }
    })

  // One throwaway launch to run the forward-only migration, so there is a
  // schema to seed the opt-in into.
  const migrating = await launch()
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()
  const raw = new Database(path.join(userDataDir, 'course-companion.db'))
  try {
    // TWO CLIs, because the menu is now bounded by the opt-in: the height
    // assertion below is about the list OVERFLOWING, and one CLI's models no
    // longer reach the cap. Claude and Antigravity are the two the app baseline
    // covers, so this is exactly the menu the picker used to build for every
    // provider — Codex reaches it through discovery alone.
    const seed = raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
    seed.run('claude.connected', '1')
    seed.run('antigravity.connected', '1')
    // Connected is not enough: the picker lists a CLI only once it has been seen
    // to work, so a menu seeded on the opt-in alone would come up empty.
    seed.run('claude.lastStatus', 'connected')
    seed.run('antigravity.lastStatus', 'connected')
  } finally {
    raw.close()
  }

  const electronApp = await launch()

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Still on Hoy, the default screen: the trigger is mounted at the Shell,
    // so it rides above whatever domain is active rather than belonging to one.
    const trigger = window.getByRole('button', { name: 'Preguntar sobre mi cursada' })
    await expect(trigger).toBeVisible({ timeout: 20_000 })
    await trigger.click()

    const panel = window.getByRole('dialog', { name: 'Preguntar sobre mi cursada' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Esta función usa tu propio uso de Claude')).toBeVisible()

    // The model picker is live and defaults to Sonnet.
    await expect(panel.getByRole('button', { name: /Sonnet 5/ })).toBeVisible()

    // The menu is BUILT from the CLIs installed on this machine, so its
    // contents differ per developer and are not asserted. What is asserted is
    // the shape the design fixes: every row sits under the heading of the CLI
    // it came from, and the list is bounded so it can never again grow past
    // the panel with no way to reach the rows below.
    await panel.getByRole('button', { name: /Sonnet 5/ }).click()
    const modelList = window.getByRole('listbox', { name: 'Modelo' })
    await expect(modelList).toBeVisible()
    await expect(window.getByRole('group', { name: 'Claude Code' })).toBeVisible()

    // At most ONE badge per CLI. Which model carries it depends on the machine
    // — Codex publishes its own ranking, Claude does not, and Antigravity is
    // offered from the app's baseline with nothing measured about it — so the
    // count is what is asserted, never the winner.
    for (const cli of ['Claude Code', 'Antigravity CLI', 'Codex CLI']) {
      const group = window.getByRole('group', { name: cli })
      if ((await group.count()) === 0) continue
      expect(await group.getByText('Recomendado').count()).toBeLessThanOrEqual(1)
    }

    const listBounds = await modelList.boundingBox()
    const panelBounds = await panel.boundingBox()
    expect(listBounds).not.toBeNull()
    expect(panelBounds).not.toBeNull()
    // Inside the panel, not spilling out of its bottom edge.
    expect(listBounds!.y + listBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height)
    // Bounded rather than as tall as its contents — the scroll the overflow bug lacked.
    await expect(modelList).toHaveJSProperty('clientHeight', 360)

    await panel.getByRole('button', { name: /Sonnet 5/ }).click()

    // The draft is typed but never sent — sending would spawn the real CLI.
    const composer = panel.getByRole('textbox')
    await composer.fill('¿Qué tengo el lunes?')
    await expect(panel.getByRole('button', { name: 'Enviar' })).toBeEnabled()

    // Ephemeral by design: closing discards the draft rather than persisting it.
    await panel.getByRole('button', { name: 'Cerrar' }).click()
    await trigger.click()
    await expect(panel.getByRole('textbox')).toHaveValue('')
  } finally {
    await electronApp.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})
