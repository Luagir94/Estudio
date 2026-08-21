import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import { attachments, subjects } from '../../db/schema'
import { createSqliteChunkStore } from './sqliteChunkStore'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

/**
 * Every test goes through the PRODUCTION connection factory
 * (`openAppDatabase`) and the PRODUCTION migrator — not a hand-rolled raw
 * connection — so `foreign_keys = ON` and migration 0007's hand-authored
 * FTS5 virtual table + AI/AD/AU triggers are actually exercised (same
 * pattern as `sqliteAttachmentRepository.test.ts`).
 */
function createTestDb() {
  const { db, raw } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return { db, raw }
}

function seedSubject(db: ReturnType<typeof createTestDb>['db'], name = 'Algoritmos'): number {
  return db.insert(subjects).values({ name, code: 'ALG-101', color: '#7c3aed' }).returning().get().id
}

function seedAttachment(
  db: ReturnType<typeof createTestDb>['db'],
  subjectId: number,
  fileName = 'apuntes.pdf'
): number {
  return db
    .insert(attachments)
    .values({
      subjectId,
      fileName,
      storedPath: `${subjectId}/uuid-${fileName}`,
      mimeType: null,
      sizeBytes: 1024,
      title: null,
      createdAt: '2026-08-16T10:00'
    })
    .returning()
    .get().id
}

describe('createSqliteChunkStore', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let raw: ReturnType<typeof createTestDb>['raw']
  let subjectId: number
  let attachmentId: number

  beforeEach(() => {
    ;({ db, raw } = createTestDb())
    subjectId = seedSubject(db)
    attachmentId = seedAttachment(db, subjectId)
  })

  it('search finds an inserted chunk by MATCH and resolves displayName/subjectName from the join', () => {
    const store = createSqliteChunkStore(raw)

    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'la clase de algebra lineal cubre matrices' }])

    const results = store.search('algebra', 10)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      text: 'la clase de algebra lineal cubre matrices',
      displayName: 'apuntes.pdf',
      subjectName: 'Algoritmos'
    })
  })

  it('search returns no results for a term that does not appear in any indexed chunk', () => {
    const store = createSqliteChunkStore(raw)
    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'contenido sobre calculo integral' }])

    expect(store.search('geografia', 10)).toEqual([])
  })

  it('search returns an empty array without querying MATCH when the question has no alphanumeric tokens', () => {
    const store = createSqliteChunkStore(raw)
    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'gato perro gato gato' }])

    expect(store.search('???', 10)).toEqual([])
  })

  it('orders results by bm25 relevance — higher term frequency in an equal-length chunk ranks first', () => {
    const store = createSqliteChunkStore(raw)
    const otherAttachmentId = seedAttachment(db, subjectId, 'otro.pdf')
    // Same document length (3 tokens each) so bm25's length normalization
    // is equal — only term frequency of "gato" differs, which is the exact
    // property bm25 is designed to rank on.
    store.insertMany([
      { attachmentId, subjectId, chunkIndex: 0, text: 'gato perro pez' },
      { attachmentId: otherAttachmentId, subjectId, chunkIndex: 0, text: 'gato gato gato' }
    ])

    const results = store.search('gato', 10)

    expect(results).toHaveLength(2)
    expect(results[0]?.text).toBe('gato gato gato')
    expect(results[1]?.text).toBe('gato perro pez')
  })

  it('limits results to maxChunks even when more chunks match', () => {
    const store = createSqliteChunkStore(raw)
    const secondAttachmentId = seedAttachment(db, subjectId, 'segundo.pdf')
    const thirdAttachmentId = seedAttachment(db, subjectId, 'tercero.pdf')
    store.insertMany([
      { attachmentId, subjectId, chunkIndex: 0, text: 'redes neuronales convolucionales' },
      { attachmentId: secondAttachmentId, subjectId, chunkIndex: 0, text: 'redes neuronales recurrentes' },
      { attachmentId: thirdAttachmentId, subjectId, chunkIndex: 0, text: 'redes neuronales generativas' }
    ])

    expect(store.search('redes', 2)).toHaveLength(2)
  })

  it('FK-cascade delete of the ATTACHMENT empties the FTS index via the AD trigger (design open question)', () => {
    const store = createSqliteChunkStore(raw)
    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'estructuras de datos y algoritmos' }])
    expect(store.search('estructuras', 10)).toHaveLength(1)

    db.delete(attachments).where(eq(attachments.id, attachmentId)).run()

    // Prove the FTS side really emptied through the trigger, not merely
    // that the joined row disappeared — a search that previously matched
    // must now return nothing.
    expect(store.search('estructuras', 10)).toEqual([])
    const ftsCount = raw.prepare('SELECT COUNT(*) as count FROM attachment_chunks_fts').get() as {
      count: number
    }
    expect(ftsCount.count).toBe(0)
  })

  it("replaceChunks atomically swaps an attachment's chunks — old text stops matching, new text matches (idempotent re-indexing, no duplicates)", () => {
    const store = createSqliteChunkStore(raw)
    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'version original del documento' }])
    expect(store.search('original', 10)).toHaveLength(1)

    store.replaceChunks(attachmentId, subjectId, ['version revisada del documento'])

    expect(store.search('original', 10)).toEqual([])
    expect(store.search('revisada', 10)).toHaveLength(1)
    const chunkCount = raw
      .prepare('SELECT COUNT(*) as count FROM attachment_chunks WHERE attachment_id = ?')
      .get(attachmentId) as { count: number }
    expect(chunkCount.count).toBe(1)
  })

  it('replaceChunks called twice with the SAME text never produces duplicate rows (spec: Re-indexing is idempotent)', () => {
    const store = createSqliteChunkStore(raw)

    store.replaceChunks(attachmentId, subjectId, ['contenido estable'])
    store.replaceChunks(attachmentId, subjectId, ['contenido estable'])

    const chunkCount = raw
      .prepare('SELECT COUNT(*) as count FROM attachment_chunks WHERE attachment_id = ?')
      .get(attachmentId) as { count: number }
    expect(chunkCount.count).toBe(1)
    expect(store.search('estable', 10)).toHaveLength(1)
  })

  it('FK-cascade delete of the owning SUBJECT (two-level cascade) also empties the FTS index via the AD trigger', () => {
    const store = createSqliteChunkStore(raw)
    store.insertMany([{ attachmentId, subjectId, chunkIndex: 0, text: 'programacion orientada a objetos' }])
    expect(store.search('programacion', 10)).toHaveLength(1)

    db.delete(subjects).where(eq(subjects.id, subjectId)).run()

    expect(store.search('programacion', 10)).toEqual([])
    const ftsCount = raw.prepare('SELECT COUNT(*) as count FROM attachment_chunks_fts').get() as {
      count: number
    }
    expect(ftsCount.count).toBe(0)
    const remainingChunks = raw.prepare('SELECT COUNT(*) as count FROM attachment_chunks').get() as {
      count: number
    }
    expect(remainingChunks.count).toBe(0)
  })
})
