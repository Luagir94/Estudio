import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// The palette's end-to-end proof, and the only place the CSS CASCADE is
// actually exercised. Every layer below this has a double somewhere: the unit
// tests assert that `data-palette` gets written, never that writing it repaints
// anything. Whether `:root[data-palette='cobalto']` really out-specifies the
// base tokens — in both schemes — is a question only a real stylesheet in a
// real browser can answer, so it is asked here against computed styles.
//
// Same `_electron` + packaged-build launch shape as `claude-connection.spec.ts`
// — `electron .` from the project root, isolated `--user-data-dir`, and
// `npm run build` already ran via the `test:e2e` script.

/** The canvas each palette paints, per scheme — mirrors `globals.css`. */
const CANVAS = {
  amatista: { dark: 'rgb(11, 11, 14)', light: 'rgb(244, 244, 247)' },
  cobalto: { dark: 'rgb(10, 12, 15)', light: 'rgb(243, 244, 246)' }
} as const

test('launch paints the default palette -> choosing one repaints -> it survives a restart', async () => {
  const projectRoot = path.join(__dirname, '..')
  // ONE data directory across BOTH launches: the palette lives in the sqlite
  // settings table, so a fresh directory per launch would prove nothing.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-palette-'))
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })

  try {
    const first = await launch()
    try {
      const window = await first.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // The theme preference defaults to `system`, so which half of each pair
      // is correct depends on the machine running this. Read it once and hold
      // both halves to the same answer.
      const scheme = (await window.evaluate(() =>
        window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      )) as 'light' | 'dark'

      // A profile that never chose is still EXPLICITLY amatista: `main.tsx`
      // writes the attribute before the first render rather than leaving it
      // absent, so "not applied yet" and "chose the default" stay tellable
      // apart in the DOM.
      await expect(window.locator('html')).toHaveAttribute('data-palette', 'amatista')
      await expect
        .poll(() => window.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe(CANVAS.amatista[scheme])

      await window.getByRole('button', { name: 'Ajustes' }).click()
      await expect(window.getByRole('heading', { name: 'Ajustes' })).toBeVisible({ timeout: 20_000 })

      const paletteSelect = window.getByRole('combobox', { name: 'Paleta' })
      await expect(paletteSelect).toHaveValue('amatista')

      await paletteSelect.selectOption('cobalto')

      // THE assertion the unit tests cannot make: the attribute moved AND the
      // page actually repainted, which is the cascade working.
      await expect(window.locator('html')).toHaveAttribute('data-palette', 'cobalto')
      await expect
        .poll(() => window.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe(CANVAS.cobalto[scheme])
    } finally {
      await first.close()
    }

    // The whole point of persisting it: the student made this decision once.
    const second = await launch()
    try {
      const window = await second.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Applied on the way IN, before any screen mounts — this assertion runs
      // on the Hoy dashboard, which never reads the palette query. If the
      // attribute only arrived once Ajustes was opened, this would be
      // `amatista` here.
      await expect(window.locator('html')).toHaveAttribute('data-palette', 'cobalto')

      await window.getByRole('button', { name: 'Ajustes' }).click()
      await expect(window.getByRole('combobox', { name: 'Paleta' })).toHaveValue('cobalto', { timeout: 20_000 })
    } finally {
      await second.close()
    }
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
