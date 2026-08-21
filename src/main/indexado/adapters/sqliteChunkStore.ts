import type Database from 'better-sqlite3'
import { buildMatchQuery } from '../domain/ftsQuery'

export interface InsertChunkInput {
  attachmentId: number
  subjectId: number
  chunkIndex: number
  text: string
}

export interface RetrievedChunk {
  text: string
  displayName: string
  subjectName: string
}

export interface ChunkStore {
  /** Inserts all rows in one transaction; migration 0007's AI trigger keeps `attachment_chunks_fts` in sync per row — no dual write here. */
  insertMany(chunks: readonly InsertChunkInput[]): void
  /**
   * Atomically deletes every existing chunk row for `attachmentId`, then
   * inserts `texts` as fresh chunks (indexed 0..n-1) — the transaction
   * boundary that makes re-indexing idempotent (spec "Re-indexing is
   * idempotent": no duplicate chunk rows) no matter how many times a job
   * runs for the same attachment (design "Job pipeline": "tx{delete old
   * chunks, insert, set indexed}").
   */
  replaceChunks(attachmentId: number, subjectId: number, texts: readonly string[]): void
  /**
   * Top-`maxChunks` BM25 matches across every indexed chunk (design "MATCH
   * construction" / "Storage"). Returns `[]` without touching SQLite when
   * `question` has no alphanumeric tokens (`buildMatchQuery` → `null`) —
   * mirrors the "empty result → skip retrieval entirely" rule.
   */
  search(question: string, maxChunks: number): readonly RetrievedChunk[]
}

/**
 * Raw better-sqlite3 handle adapter (design "Storage", D5's raw-handle
 * precedent): FTS5 `MATCH`/`bm25()` have no drizzle query-builder
 * equivalent, so this talks to SQLite directly instead of through
 * `AppDatabase`. Migration 0006 (typed `attachment_chunks` table) and 0007
 * (hand-authored FTS5 virtual table + AI/AD/AU sync triggers) are both
 * prerequisites — this adapter writes ONLY to `attachment_chunks`; the
 * triggers are the sole path that ever touches `attachment_chunks_fts`.
 */
export function createSqliteChunkStore(raw: Database.Database): ChunkStore {
  const insertStatement = raw.prepare(
    'INSERT INTO attachment_chunks (attachment_id, subject_id, chunk_index, text) VALUES (?, ?, ?, ?)'
  )
  const searchStatement = raw.prepare(`
    SELECT c.text AS text, a.file_name AS displayName, s.name AS subjectName
    FROM attachment_chunks_fts f
    JOIN attachment_chunks c ON c.id = f.rowid
    JOIN attachments a ON a.id = c.attachment_id
    JOIN subjects s ON s.id = c.subject_id
    WHERE attachment_chunks_fts MATCH ?
    ORDER BY bm25(attachment_chunks_fts)
    LIMIT ?
  `)
  const deleteByAttachmentStatement = raw.prepare('DELETE FROM attachment_chunks WHERE attachment_id = ?')
  const insertAll = raw.transaction((chunks: readonly InsertChunkInput[]) => {
    for (const chunk of chunks) {
      insertStatement.run(chunk.attachmentId, chunk.subjectId, chunk.chunkIndex, chunk.text)
    }
  })
  const replaceChunksTx = raw.transaction((attachmentId: number, subjectId: number, texts: readonly string[]) => {
    deleteByAttachmentStatement.run(attachmentId)
    texts.forEach((text, chunkIndex) => {
      insertStatement.run(attachmentId, subjectId, chunkIndex, text)
    })
  })

  return {
    insertMany(chunks) {
      insertAll(chunks)
    },
    replaceChunks(attachmentId, subjectId, texts) {
      replaceChunksTx(attachmentId, subjectId, texts)
    },
    search(question, maxChunks) {
      const matchQuery = buildMatchQuery(question)
      if (matchQuery === null) {
        return []
      }
      return searchStatement.all(matchQuery, maxChunks) as RetrievedChunk[]
    }
  }
}
