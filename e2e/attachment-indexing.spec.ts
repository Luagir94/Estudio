import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { _electron as electron, expect, test } from '@playwright/test'

// Task 3.8 (attachment-fts-index Slice 3) — the real app, real preload
// bridge, real IPC, real `indexadoService`, real extractor, real FTS5
// triggers. Same `_electron` + isolated `--user-data-dir` launch shape as
// `ask-my-materials.spec.ts` / `ask-history-persistence.spec.ts`.
//
// SCOPE, and why it stops where it does: this file proves the badge +
// Sincronizar + real indexing pipeline end to end, and then proves the
// retrieval query `AskAttachmentIndexPort` is wired to (the exact SQL
// `sqliteChunkStore.ts` runs) returns the right, citation-resolvable chunk
// for a real seeded file — WITHOUT ever spawning a real CLI. That
// restriction is the SAME one `ask-my-materials.spec.ts` documents at its
// own top: a real ask round trip spawns the real `claude`/`agy`/`codex`
// binary and spends the user's own usage on every single test run, so no
// automated test in this repo exercises that spawn. The mechanism that
// makes a retrieved chunk's citation resolve (matching `displayName`/
// `subjectName`, sentinel-wrapped prompt section, `computeRetrievalWindow`
// budget trim) is already covered end to end at the unit layer by
// `promptBuilder.test.ts` and `askService.test.ts`'s "retrieval wiring"
// describe block with an injected fake spawn — this file's job is to prove
// the REAL data layer those units assume is real.

test('a pending attachment gets a real Sincronizar pass, its badge updates, and its indexed content is retrievable by BM25 with citation-resolvable names', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-indexing-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })

  // One throwaway launch to run the forward-only migration, so there is a
  // schema (including migrations 0006/0007's FTS5 table + triggers) to seed
  // into.
  const migrating = await launch()
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  // Seed a subject + a `pending` attachment whose storedPath points at a
  // REAL file on disk — never through `adjuntos:add` (that would need a
  // picker dialog), the same "seed the row a real action would have
  // written" convention `ask-history-persistence.spec.ts` uses for turns.
  const subjectId = 1
  const attachmentId = 1
  const fileName = 'apunte-anillos.txt'
  const storedRelativePath = `${subjectId}/${fileName}`
  const fileContent =
    'Un anillo conmutativo es una estructura algebraica con dos operaciones asociativas, suma y producto.'

  const attachmentDir = path.join(userDataDir, 'attachments', String(subjectId))
  fs.mkdirSync(attachmentDir, { recursive: true })
  fs.writeFileSync(path.join(attachmentDir, fileName), fileContent, 'utf8')

  const seedDb = new Database(dbPath)
  try {
    seedDb
      .prepare('INSERT INTO subjects (id, name, code, color) VALUES (?, ?, ?, ?)')
      .run(subjectId, 'Álgebra', 'MAT-101', '#7c3aed')
    seedDb
      .prepare(
        'INSERT INTO attachments (id, subject_id, file_name, stored_path, size_bytes, created_at, index_status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        attachmentId,
        subjectId,
        fileName,
        storedRelativePath,
        Buffer.byteLength(fileContent, 'utf8'),
        '2026-08-21T09:00',
        'pending'
      )
  } finally {
    seedDb.close()
  }

  const electronApp = await launch()

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: 'Materias' }).click()
    await window.getByRole('button', { name: /Álgebra/ }).click()

    await expect(window.getByText('ADJUNTOS')).toBeVisible({ timeout: 20_000 })
    await expect(window.getByText(fileName)).toBeVisible()

    // Badge state 1/2: seeded as `pending`, migrated exactly the way a
    // pre-existing row would be (spec "Sincronizar picks up pre-existing and
    // stuck attachments").
    await expect(window.getByText('Pendiente')).toBeVisible()

    // The REAL round trip: click -> `indexado:sync` IPC -> `syncAll()` ->
    // the FIFO queue -> `detectExtractionFormat` -> `extractTextFileText`
    // (a REAL fs read of the file written above) -> `chunkText` -> REAL
    // `attachment_chunks` insert -> REAL FTS5 AI trigger -> `setStatus`
    // -> REAL `webContents.send` push -> the container's REAL
    // `invalidate(['adjuntos', subjectId])`.
    await window.getByRole('button', { name: 'Sincronizar' }).click()

    // Badge state 2/2: the pipeline actually ran and flipped the row.
    await expect(window.getByText('Indexado')).toBeVisible({ timeout: 20_000 })
  } finally {
    await electronApp.close()
  }

  // Retrieval proof, run against the file the app just wrote: the EXACT
  // query `sqliteChunkStore.ts`'s `search()` runs (the function
  // `AskAttachmentIndexPort` is wired to in `src/main/index.ts`), over the
  // REAL rows the real pipeline above inserted — no fake, no unit double.
  const verifyDb = new Database(dbPath)
  try {
    const rows = verifyDb
      .prepare(
        `SELECT c.text AS text, a.file_name AS displayName, s.name AS subjectName
         FROM attachment_chunks_fts f
         JOIN attachment_chunks c ON c.id = f.rowid
         JOIN attachments a ON a.id = c.attachment_id
         JOIN subjects s ON s.id = c.subject_id
         WHERE attachment_chunks_fts MATCH ?
         ORDER BY bm25(attachment_chunks_fts)
         LIMIT ?`
      )
      .all('"anillo"', 6) as { text: string; displayName: string; subjectName: string }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].displayName).toBe(fileName)
    expect(rows[0].subjectName).toBe('Álgebra')
    expect(rows[0].text).toContain('anillo conmutativo')
  } finally {
    verifyDb.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Unit 10 (cli-generated-artifacts, stretch): the SAME real pipeline as the
// test above, proving it for a row with `origin: 'ai-generated'` — the exact
// shape `attachmentService.addGeneratedAttachment` writes (design "Port
// Contract + Orchestration": real file write via `writeIntoSubjectDir`, real
// insert via the SAME repository with `origin: 'ai-generated'`, then
// `indexer.enqueue`). `addGeneratedAttachment` itself is reachable ONLY
// through `askService`'s orchestration (a real CLI spawn producing an
// artifact block) — the SAME spawn restriction `ask-my-materials.spec.ts`
// documents applies here too, so this test seeds the row and file the write
// path would have produced (the SAME "seed what a real action would have
// written" convention every e2e file in this suite already uses), then
// reuses Sincronizar for the real pending -> indexed transition exactly like
// the test above. This also proves the origin ripple end to end: the IA
// badge (Unit 9's `originBadgeFor`) renders from the REAL persisted column,
// not a fixture.
test('an ai-generated attachment is indexed, badged, and BM25-retrievable exactly like a user upload', async () => {
  const projectRoot = path.join(__dirname, '..')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-companion-e2e-indexing-generated-'))
  const dbPath = path.join(userDataDir, 'course-companion.db')
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })

  // One throwaway launch to run the forward-only migration (including
  // migration 0008's `origin` column), so there is a schema to seed into.
  const migrating = await launch()
  await (await migrating.firstWindow()).waitForLoadState('domcontentloaded')
  await migrating.close()

  // Seed a subject + an `ai-generated`, `pending` attachment whose
  // storedPath points at a REAL file on disk — the exact shape
  // `writeIntoSubjectDir` + `repository.insert({ origin: 'ai-generated' })`
  // produce (design "Port Contract + Orchestration").
  const subjectId = 1
  const attachmentId = 1
  const fileName = 'resumen-anillos.md'
  const storedRelativePath = `${subjectId}/${fileName}`
  const fileContent =
    'Resumen: un cuerpo es un anillo conmutativo donde todo elemento distinto de cero tiene inverso multiplicativo.'

  const attachmentDir = path.join(userDataDir, 'attachments', String(subjectId))
  fs.mkdirSync(attachmentDir, { recursive: true })
  fs.writeFileSync(path.join(attachmentDir, fileName), fileContent, 'utf8')

  const seedDb = new Database(dbPath)
  try {
    seedDb
      .prepare('INSERT INTO subjects (id, name, code, color) VALUES (?, ?, ?, ?)')
      .run(subjectId, 'Álgebra', 'MAT-101', '#7c3aed')
    seedDb
      .prepare(
        'INSERT INTO attachments (id, subject_id, file_name, stored_path, size_bytes, created_at, index_status, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        attachmentId,
        subjectId,
        fileName,
        storedRelativePath,
        Buffer.byteLength(fileContent, 'utf8'),
        '2026-08-22T09:00',
        'pending',
        'ai-generated'
      )
  } finally {
    seedDb.close()
  }

  const electronApp = await launch()

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: 'Materias' }).click()
    await window.getByRole('button', { name: /Álgebra/ }).click()

    await expect(window.getByText('ADJUNTOS')).toBeVisible({ timeout: 20_000 })
    await expect(window.getByText(fileName)).toBeVisible()

    // Origin ripple, proven live: the IA badge (Unit 9's `originBadgeFor`)
    // renders from the REAL `origin` column this row was seeded with.
    // `exact: true` because plain substring `getByText` is case-insensitive
    // and "IA" is a substring of several Spanish words already on this page
    // ("Materias", "Asistencia").
    await expect(window.getByText('IA', { exact: true })).toBeVisible()
    await expect(window.getByText('Pendiente')).toBeVisible()

    // The REAL round trip, same pipeline as a user upload — Sincronizar
    // makes no distinction by origin (spec "reuses the existing attachment
    // lifecycle").
    await window.getByRole('button', { name: 'Sincronizar' }).click()

    await expect(window.getByText('Indexado')).toBeVisible({ timeout: 20_000 })
    // The IA badge survives the index-status transition — it is additive,
    // never replaced by the index status badge.
    await expect(window.getByText('IA', { exact: true })).toBeVisible()
  } finally {
    await electronApp.close()
  }

  // Retrieval proof: the exact `sqliteChunkStore.ts` query, over the REAL
  // rows the real pipeline inserted for an `ai-generated` attachment —
  // proving BM25 eligibility carries no origin distinction (spec "Saved
  // artifact becomes retrievable by later questions").
  const verifyDb = new Database(dbPath)
  try {
    const rows = verifyDb
      .prepare(
        `SELECT c.text AS text, a.file_name AS displayName, a.origin AS origin, s.name AS subjectName
         FROM attachment_chunks_fts f
         JOIN attachment_chunks c ON c.id = f.rowid
         JOIN attachments a ON a.id = c.attachment_id
         JOIN subjects s ON s.id = c.subject_id
         WHERE attachment_chunks_fts MATCH ?
         ORDER BY bm25(attachment_chunks_fts)
         LIMIT ?`
      )
      .all('"cuerpo"', 6) as { text: string; displayName: string; origin: string; subjectName: string }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].displayName).toBe(fileName)
    expect(rows[0].origin).toBe('ai-generated')
    expect(rows[0].subjectName).toBe('Álgebra')
    expect(rows[0].text).toContain('anillo conmutativo')
  } finally {
    verifyDb.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
