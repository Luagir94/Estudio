import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Restart-survival smoke (design D6/D1, spec "Resume-on-Open"): the panel
// must resume a conversation written by a PRIOR launch. Real preload bridge,
// real IPC, real repository — same `_electron` + isolated `--user-data-dir`
// shape as `ask-my-materials.spec.ts`. The turn is seeded DIRECTLY into the
// sqlite file between launches (same reason `ask-my-materials.spec.ts` never
// sends a real question: a real round trip spawns the real `claude` CLI and
// spends the user's own usage on every run). Seeding still exercises the
// real read path: `ask:getConversation` → the sqlite repository → the
// window computation → `toEntries`.

test('a conversation written before relaunch is resumed with its content after relaunch', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-ask-history-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')

  // First launch: runs the forward-only migration, creating the schema.
  const firstLaunch = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })
  const firstWindow = await firstLaunch.firstWindow()
  await firstWindow.waitForLoadState('domcontentloaded')
  await expect(firstWindow.getByRole('button', { name: 'Preguntar sobre mi cursada' })).toBeVisible({
    timeout: 20_000
  })
  await firstLaunch.close()

  // Seed one turn directly into the migrated database — the same schema
  // `sqliteAskHistoryRepository.appendTurn` writes, without a real CLI spawn.
  const question = '¿Qué tengo el lunes a primera hora?'
  const answer = 'El lunes tenés Derecho Romano a las 08:00, según tu horario.'
  const now = '2026-08-18T09:00'
  const raw = new Database(dbPath)
  try {
    raw
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (1, ?, ?, ?)')
      .run(question, now, now)
    raw
      .prepare(
        'INSERT INTO ask_messages (id, conversation_id, question, kind, answer, model, created_at) VALUES (1, 1, ?, ?, ?, ?, ?)'
      )
      .run(question, 'general', answer, 'sonnet', now)
    // The panel is gated on the OPT-IN now, so seed the same row pressing
    // "Conectar" would have written. Seeding it rather than clicking through
    // Ajustes keeps this file's boundary intact: it still spawns no CLI.
    const seed = raw.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
    seed.run('claude.connected', '1')
    // The panel offers a CLI's models only once it has SEEN that CLI work, so
    // the remembered outcome is part of the state a connected student is in.
    seed.run('claude.lastStatus', 'connected')
  } finally {
    raw.close()
  }

  // Second launch, SAME user-data-dir: resume-on-open must pick up the
  // conversation the first launch never even knew about.
  const secondLaunch = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })
  try {
    const window = await secondLaunch.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const trigger = window.getByRole('button', { name: 'Preguntar sobre mi cursada' })
    await expect(trigger).toBeVisible({ timeout: 20_000 })
    await trigger.click()

    const panel = window.getByRole('dialog', { name: 'Preguntar sobre mi cursada' })
    await expect(panel.getByText(question)).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByText(answer)).toBeVisible()
  } finally {
    await secondLaunch.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
