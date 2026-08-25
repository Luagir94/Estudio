// Pipeline orchestrator (attachment-fts-index design "Technical Approach" /
// "Background execution"). Owns the in-process, concurrency-1 FIFO promise
// queue — `enqueue` NEVER throws and NEVER awaits the job itself, which is
// what keeps `AttachmentIndexerPort` (attachmentService.ts) safe to fire
// right after a successful insert without delaying or risking the upload
// response (spec "Non-blocking upload").
import type { ChunkStore } from './adapters/sqliteChunkStore'
import type { AttachmentIndexRow, IndexStatusRepository } from './adapters/sqliteIndexStatusRepository'
import { extractDocxText } from './adapters/extractors/docxExtractor'
import { extractPdfPages } from './adapters/extractors/pdfExtractor'
import { extractSpreadsheetText } from './adapters/extractors/spreadsheetExtractor'
import { extractTextFileText } from './adapters/extractors/textExtractor'
import { chunkPages, chunkText, type PageTaggedChunk } from './domain/chunker'
import { detectExtractionFormat, type ExtractionFormat, type ExtractionResult } from './domain/extractionDispatcher'

export interface IndexJobInput {
  attachmentId: number
  subjectId: number
  storedPath: string
  fileName: string
}

/** Dispatches a detected format to its extractor. Injectable (default below dispatches to the real per-format extractors) — tests use this seam to control extraction timing/outcome without real fixture files, the same convention as each extractor's own optional `fs` parameter. A PDF resolves to an ordered page list; every other format keeps resolving to flat un-paged text (page-number citations). */
export type ExtractFn = (format: ExtractionFormat, absolutePath: string) => Promise<ExtractionResult>

interface CreateIndexadoServiceDeps {
  statusRepository: IndexStatusRepository
  chunkStore: ChunkStore
  /** Turns a stored (relative) path into an absolute one — same port `attachmentService`/`registerAdjuntosHandlers` already consume (design wiring: `attachmentStorage.resolveStoredPath`). */
  resolveStoredPath: (storedPath: string) => string
  /** Fans out to every renderer window (design "Renderer notify") — kept as an injected function so this module never imports Electron. */
  notifyStatusChanged: (subjectId: number) => void
  extract?: ExtractFn
}

export interface IndexadoService {
  /**
   * Fire-and-forget: NEVER throws, NEVER delays the caller (design
   * "Background execution" — the CLI-independence / non-blocking-upload
   * requirement). Satisfies `attachmentService`'s `AttachmentIndexerPort`
   * structurally — this interface intentionally matches its shape.
   */
  enqueue(input: IndexJobInput): void
  /** Enqueues every attachment whose `index_status != 'indexed'` (spec "Manual Sincronizar sync") and returns the count immediately; indexing itself still runs through the same background queue. */
  syncAll(): number
  /** Resolves once every currently-queued job has finished. Test/shutdown observability only — never used by `AttachmentIndexerPort` callers, who only ever see `enqueue`'s synchronous `void`. */
  whenIdle(): Promise<void>
}

async function defaultExtract(format: ExtractionFormat, absolutePath: string): Promise<ExtractionResult> {
  switch (format) {
    case 'pdf':
      return extractPdfPages(absolutePath)
    case 'docx':
      return extractDocxText(absolutePath)
    case 'text':
      return extractTextFileText(absolutePath)
    case 'spreadsheet':
      return extractSpreadsheetText(absolutePath)
  }
}

export function createIndexadoService({
  statusRepository,
  chunkStore,
  resolveStoredPath,
  notifyStatusChanged,
  extract = defaultExtract
}: CreateIndexadoServiceDeps): IndexadoService {
  let queue: Promise<void> = Promise.resolve()

  function markNotIndexable(row: AttachmentIndexRow): void {
    statusRepository.setStatus(row.id, 'not-indexable')
    notifyStatusChanged(row.subjectId)
  }

  async function runJob(input: IndexJobInput): Promise<void> {
    // "load row (skip if deleted)" (design "Job pipeline") — the row may
    // have been removed by `adjuntos:delete` between enqueue and this job
    // actually running, since the FIFO queue can be arbitrarily backed up.
    const row = statusRepository.get(input.attachmentId)
    if (!row) {
      return
    }

    const format = detectExtractionFormat(row.fileName)
    if (format === null) {
      markNotIndexable(row)
      return
    }

    let extracted: ExtractionResult
    try {
      extracted = await extract(format, resolveStoredPath(row.storedPath))
    } catch {
      // Extraction error, caught HERE at the service boundary (2A's
      // extractors intentionally throw on corrupt input) — never surfaces,
      // never crashes the queue (spec "Corrupt file fails gracefully").
      markNotIndexable(row)
      return
    }

    // Un-paged text keeps the plain chunking path (page: null); a paged
    // extraction chunks each page independently and tags every chunk with
    // its page (page-number citations).
    const chunks: PageTaggedChunk[] =
      typeof extracted === 'string' ? chunkText(extracted).map((text) => ({ text, page: null })) : chunkPages(extracted)

    if (chunks.length === 0) {
      // A scanned/image-only PDF (empty text, or every page empty) or an
      // oversized capped file resolves successfully with nothing to index —
      // treated the same as an unsupported format (design "Job pipeline").
      markNotIndexable(row)
      return
    }

    try {
      // `replaceChunks` (not `insertMany`) is what makes this idempotent —
      // re-running indexing on an already-indexed row deletes its old
      // chunks before inserting the new ones, atomically (spec
      // "Re-indexing is idempotent").
      chunkStore.replaceChunks(row.id, row.subjectId, chunks)
      statusRepository.setStatus(row.id, 'indexed')
    } catch {
      // DB error → stays pending (design "Job pipeline") — do not flip
      // status, do not notify; Sincronizar is the only recovery path
      // (design "Quit mid-job").
      return
    }
    notifyStatusChanged(row.subjectId)
  }

  function doEnqueue(input: IndexJobInput): void {
    // Never awaited by the caller. `.catch` guards against `runJob` itself
    // throwing synchronously (e.g. a bug), so one failing job can never
    // break the chain for every job enqueued after it.
    queue = queue.then(() => runJob(input)).catch(() => {})
  }

  return {
    enqueue: doEnqueue,
    syncAll() {
      const rows = statusRepository.listUnindexed()
      for (const row of rows) {
        doEnqueue({
          attachmentId: row.id,
          subjectId: row.subjectId,
          storedPath: row.storedPath,
          fileName: row.fileName
        })
      }
      return rows.length
    },
    whenIdle() {
      return queue
    }
  }
}
