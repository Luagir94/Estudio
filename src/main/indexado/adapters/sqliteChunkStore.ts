import type Database from 'better-sqlite3'
import { buildMatchQuery } from '../domain/ftsQuery'

export interface InsertChunkInput {
  attachmentId: number
  subjectId: number
  chunkIndex: number
  text: string
  /** 1-based source page for a PDF-derived chunk; `null` for un-paged formats (page-number citations, migration 0010). */
  page: number | null
}

/** One replacement chunk in document order — `chunk_index` is positional (0..n-1), assigned by `replaceChunks` itself. */
export interface ReplaceChunkInput {
  text: string
  /** Same semantics as `InsertChunkInput.page`. */
  page: number | null
}

export interface RetrievedChunk {
  text: string
  displayName: string
  subjectName: string
  /**
   * Chunk provenance (`attachment_chunks.attachment_id` / `chunk_index`),
   * consumed by ask's diversity re-ranker: adjacent chunk indexes of the
   * same attachment are overlapping windows of one passage, and the
   * re-ranker needs to know which rows are neighbors to dedupe them.
   */
  attachmentId: number
  chunkIndex: number
  /** The chunk's source page (`attachment_chunks.page`), rendered into the prompt header so the model can cite it; `null` when the source format has no pages. */
  page: number | null
}

export interface ChunkStore {
  /** Inserts all rows in one transaction; migration 0007's AI trigger keeps `attachment_chunks_fts` in sync per row — no dual write here. */
  insertMany(chunks: readonly InsertChunkInput[]): void
  /**
   * Atomically deletes every existing chunk row for `attachmentId`, then
   * inserts `chunks` as fresh rows (indexed 0..n-1, each carrying its
   * source page) — the transaction boundary that makes re-indexing
   * idempotent (spec "Re-indexing is idempotent": no duplicate chunk rows)
   * no matter how many times a job runs for the same attachment (design
   * "Job pipeline": "tx{delete old chunks, insert, set indexed}").
   */
  replaceChunks(attachmentId: number, subjectId: number, chunks: readonly ReplaceChunkInput[]): void
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
    'INSERT INTO attachment_chunks (attachment_id, subject_id, chunk_index, text, page) VALUES (?, ?, ?, ?, ?)'
  )
  const searchStatement = raw.prepare(`
    SELECT c.text AS text, a.file_name AS displayName, s.name AS subjectName,
           c.attachment_id AS attachmentId, c.chunk_index AS chunkIndex, c.page AS page
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
      insertStatement.run(chunk.attachmentId, chunk.subjectId, chunk.chunkIndex, chunk.text, chunk.page)
    }
  })
  const replaceChunksTx = raw.transaction(
    (attachmentId: number, subjectId: number, chunks: readonly ReplaceChunkInput[]) => {
      deleteByAttachmentStatement.run(attachmentId)
      chunks.forEach((chunk, chunkIndex) => {
        insertStatement.run(attachmentId, subjectId, chunkIndex, chunk.text, chunk.page)
      })
    }
  )

  return {
    insertMany(chunks) {
      insertAll(chunks)
    },
    replaceChunks(attachmentId, subjectId, chunks) {
      replaceChunksTx(attachmentId, subjectId, chunks)
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
