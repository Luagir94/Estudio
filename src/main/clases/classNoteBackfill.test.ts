import { describe, expect, it, vi } from 'vitest'
import { backfillClassNotes, type ClassNoteBackfillPorts } from './classNoteBackfill'

function makePorts(overrides: Partial<ClassNoteBackfillPorts> = {}): ClassNoteBackfillPorts {
  return {
    listLegacyNotes: vi.fn().mockReturnValue([]),
    hasApunte: vi.fn().mockReturnValue(false),
    saveApunte: vi.fn().mockResolvedValue({ ok: true }),
    dropLegacyNote: vi.fn(),
    ...overrides
  }
}

describe('backfillClassNotes', () => {
  it('writes every legacy apunte as an attachment', async () => {
    const ports = makePorts({
      listLegacyNotes: vi.fn().mockReturnValue([
        { subjectId: 1, date: '2026-08-24', body: '# Capa de aplicación' },
        { subjectId: 2, date: '2026-08-25', body: 'Redes' }
      ])
    })

    const result = await backfillClassNotes(ports)

    expect(ports.saveApunte).toHaveBeenCalledWith(1, '2026-08-24', '# Capa de aplicación')
    expect(ports.saveApunte).toHaveBeenCalledWith(2, '2026-08-25', 'Redes')
    expect(result).toEqual({ migrated: 2, skipped: 0, failed: 0 })
  })

  /*
   * THE reason the legacy row is dropped rather than left behind: this runs on
   * every boot, so a row that survived migration would be re-migrated after
   * the student deleted the apunte — resurrecting a document they threw away.
   */
  it('drops the legacy row once its apunte is written, so a later delete stays deleted', async () => {
    const ports = makePorts({
      listLegacyNotes: vi.fn().mockReturnValue([{ subjectId: 1, date: '2026-08-24', body: 'algo' }])
    })

    await backfillClassNotes(ports)

    expect(ports.dropLegacyNote).toHaveBeenCalledWith(1, '2026-08-24')
  })

  it('never overwrites an apunte the student already has', async () => {
    const ports = makePorts({
      listLegacyNotes: vi.fn().mockReturnValue([{ subjectId: 1, date: '2026-08-24', body: 'viejo' }]),
      hasApunte: vi.fn().mockReturnValue(true)
    })

    const result = await backfillClassNotes(ports)

    expect(ports.saveApunte).not.toHaveBeenCalled()
    // Still dropped: the legacy row is the stale copy, not the live one.
    expect(ports.dropLegacyNote).toHaveBeenCalledWith(1, '2026-08-24')
    expect(result).toEqual({ migrated: 0, skipped: 1, failed: 0 })
  })

  /*
   * A failed write must LEAVE the legacy row alone — it is the only surviving
   * copy of that apunte, and dropping it would destroy the student's work to
   * tidy up a table.
   */
  it('keeps the legacy row when the write fails', async () => {
    const ports = makePorts({
      listLegacyNotes: vi.fn().mockReturnValue([{ subjectId: 1, date: '2026-08-24', body: 'importante' }]),
      saveApunte: vi.fn().mockResolvedValue({ ok: false })
    })

    const result = await backfillClassNotes(ports)

    expect(ports.dropLegacyNote).not.toHaveBeenCalled()
    expect(result).toEqual({ migrated: 0, skipped: 0, failed: 1 })
  })

  it('keeps the legacy row when the write throws, and keeps going', async () => {
    const ports = makePorts({
      listLegacyNotes: vi.fn().mockReturnValue([
        { subjectId: 1, date: '2026-08-24', body: 'explota' },
        { subjectId: 2, date: '2026-08-25', body: 'sobrevive' }
      ]),
      saveApunte: vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce({ ok: true })
    })

    const result = await backfillClassNotes(ports)

    expect(ports.dropLegacyNote).toHaveBeenCalledTimes(1)
    expect(ports.dropLegacyNote).toHaveBeenCalledWith(2, '2026-08-25')
    expect(result).toEqual({ migrated: 1, skipped: 0, failed: 1 })
  })

  it('does nothing at all once the table is drained', async () => {
    const ports = makePorts()

    const result = await backfillClassNotes(ports)

    expect(ports.saveApunte).not.toHaveBeenCalled()
    expect(result).toEqual({ migrated: 0, skipped: 0, failed: 0 })
  })
})
