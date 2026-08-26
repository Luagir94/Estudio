// One-shot data migration, re-run harmlessly on every boot: moves the apuntes
// that live as `class_notes` ROWS into the markdown ATTACHMENTS they are now.
//
// It exists as its own module, driven by ports, because a SQL migration
// cannot do this: every legacy apunte has to become a FILE on disk, and
// drizzle's migrations only speak SQL. This is the app-side half.
//
// Framework-free by construction — no electron, no drizzle, no fs. The
// composition root supplies the four verbs.
import log from 'electron-log'

/** One surviving `class_notes` row: the apunte as it was stored before apuntes were attachments. */
export interface LegacyClassNoteRow {
  subjectId: number
  date: string
  body: string
}

export interface ClassNoteBackfillPorts {
  listLegacyNotes(): LegacyClassNoteRow[]
  /** Whether that class ALREADY has an attachment-backed apunte — the live copy always wins. */
  hasApunte(subjectId: number, classDate: string): boolean
  saveApunte(subjectId: number, classDate: string, content: string): Promise<{ ok: boolean }>
  /** Removes the legacy row. Called ONLY once that apunte is safe somewhere else. */
  dropLegacyNote(subjectId: number, classDate: string): void
}

export interface ClassNoteBackfillResult {
  migrated: number
  skipped: number
  failed: number
}

/**
 * Migrates every legacy apunte, then drains the row that held it.
 *
 * Dropping the legacy row is the load-bearing step, and not for tidiness:
 * this runs on EVERY boot, so a row left behind would be re-migrated the next
 * time the app started — resurrecting an apunte the student had since
 * deleted. Draining the table is what makes "deleted" stick.
 *
 * The mirror of that rule is why a FAILED write keeps its row: at that moment
 * the legacy row is the only surviving copy of that apunte, and destroying a
 * student's work to tidy up a table is not a trade this is allowed to make.
 * The next boot tries again.
 */
export async function backfillClassNotes(ports: ClassNoteBackfillPorts): Promise<ClassNoteBackfillResult> {
  const result: ClassNoteBackfillResult = { migrated: 0, skipped: 0, failed: 0 }

  for (const row of ports.listLegacyNotes()) {
    // An apunte written since the upgrade is the LIVE one; the legacy row is a
    // stale copy of a document that has already moved on. Dropping it without
    // writing is correct — overwriting would silently revert the student's
    // newer text to whatever the old table happened to hold.
    if (ports.hasApunte(row.subjectId, row.date)) {
      ports.dropLegacyNote(row.subjectId, row.date)
      result.skipped += 1
      continue
    }

    try {
      const saved = await ports.saveApunte(row.subjectId, row.date, row.body)
      if (!saved.ok) {
        result.failed += 1
        continue
      }
      ports.dropLegacyNote(row.subjectId, row.date)
      result.migrated += 1
    } catch (error) {
      // Per-row isolation, same rule `addAttachments` applies to a batch of
      // files: one apunte that cannot be written must not strand the rest.
      log.error(`classNoteBackfill failed for subject ${row.subjectId} on ${row.date}`, error)
      result.failed += 1
    }
  }

  if (result.migrated > 0 || result.failed > 0) {
    log.info(
      `classNoteBackfill: ${result.migrated} apunte(s) migrated, ${result.skipped} already current, ${result.failed} left for the next boot`
    )
  }
  return result
}
