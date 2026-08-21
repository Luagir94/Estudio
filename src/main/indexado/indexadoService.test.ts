import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RetrievedChunk } from './adapters/sqliteChunkStore'
import type { AttachmentIndexRow, IndexStatusRepository } from './adapters/sqliteIndexStatusRepository'
import type { IndexStatus } from './domain/indexStatus'
import { createIndexadoService, type ExtractFn, type IndexadoService } from './indexadoService'

/** Deferred promise — lets a test control exactly when an async step settles, which is what proves true FIFO serialization instead of merely observing incidental ordering. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createFakeStatusRepository(
  rows: AttachmentIndexRow[] = []
): IndexStatusRepository & { rows: Map<number, AttachmentIndexRow> } {
  const store = new Map<number, AttachmentIndexRow>(rows.map((row) => [row.id, row]))
  return {
    rows: store,
    listUnindexed() {
      return [...store.values()].filter((row) => row.indexStatus !== 'indexed')
    },
    get(attachmentId) {
      return store.get(attachmentId) ?? null
    },
    setStatus(attachmentId, status: IndexStatus) {
      const existing = store.get(attachmentId)
      if (!existing) return
      store.set(attachmentId, { ...existing, indexStatus: status })
    }
  }
}

function createFakeChunkStore() {
  const chunksByAttachment = new Map<number, string[]>()
  return {
    insertMany: vi.fn(),
    replaceChunks: vi.fn((attachmentId: number, _subjectId: number, texts: readonly string[]) => {
      chunksByAttachment.set(attachmentId, [...texts])
    }),
    search: vi.fn((): readonly RetrievedChunk[] => []),
    chunksByAttachment
  }
}

const row = (overrides: Partial<AttachmentIndexRow> = {}): AttachmentIndexRow => ({
  id: 1,
  subjectId: 10,
  fileName: 'apuntes.txt',
  storedPath: '10/uuid-apuntes.txt',
  indexStatus: 'pending',
  ...overrides
})

describe('createIndexadoService', () => {
  let statusRepository: ReturnType<typeof createFakeStatusRepository>
  let chunkStore: ReturnType<typeof createFakeChunkStore>
  let notifyStatusChanged: ReturnType<typeof vi.fn<(subjectId: number) => void>>
  let resolveStoredPath: ReturnType<typeof vi.fn<(storedPath: string) => string>>

  beforeEach(() => {
    statusRepository = createFakeStatusRepository()
    chunkStore = createFakeChunkStore()
    notifyStatusChanged = vi.fn<(subjectId: number) => void>()
    resolveStoredPath = vi.fn<(storedPath: string) => string>((storedPath) => `/abs/${storedPath}`)
  })

  function createService(extract: ExtractFn): IndexadoService {
    return createIndexadoService({ statusRepository, chunkStore, resolveStoredPath, notifyStatusChanged, extract })
  }

  it('enqueue never throws synchronously, even for an attachment the repository has never heard of', () => {
    const service = createService(vi.fn().mockResolvedValue('texto'))

    expect(() => service.enqueue({ attachmentId: 42, subjectId: 1, storedPath: 'x', fileName: 'x.txt' })).not.toThrow()
  })

  it('deleted-row no-op: a job for an attachment no longer in the repository does nothing (no status write, no chunks, no notify)', async () => {
    const service = createService(vi.fn().mockResolvedValue('texto'))

    service.enqueue({ attachmentId: 999, subjectId: 1, storedPath: 'x', fileName: 'x.txt' })
    await service.whenIdle()

    expect(chunkStore.replaceChunks).not.toHaveBeenCalled()
    expect(notifyStatusChanged).not.toHaveBeenCalled()
  })

  it('unsupported extension short-circuits to not-indexable WITHOUT ever calling extract (spec: Unsupported extension skipped)', async () => {
    statusRepository.rows.set(1, row({ fileName: 'foto.png' }))
    const extract = vi.fn().mockResolvedValue('texto')
    const service = createService(extract)

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-foto.png', fileName: 'foto.png' })
    await service.whenIdle()

    expect(extract).not.toHaveBeenCalled()
    expect(statusRepository.get(1)?.indexStatus).toBe('not-indexable')
    expect(notifyStatusChanged).toHaveBeenCalledWith(10)
  })

  it('successful extraction transitions pending -> indexed, replaces chunks, and notifies the subject', async () => {
    statusRepository.rows.set(1, row())
    const service = createService(vi.fn().mockResolvedValue('contenido de dos mil quinientos caracteres'))

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-apuntes.txt', fileName: 'apuntes.txt' })
    await service.whenIdle()

    expect(resolveStoredPath).toHaveBeenCalledWith('10/uuid-apuntes.txt')
    expect(chunkStore.replaceChunks).toHaveBeenCalledWith(1, 10, ['contenido de dos mil quinientos caracteres'])
    expect(statusRepository.get(1)?.indexStatus).toBe('indexed')
    expect(notifyStatusChanged).toHaveBeenCalledWith(10)
  })

  it('a rejecting extractor is caught at the service boundary and transitions the row to not-indexable (spec: Corrupt file fails gracefully)', async () => {
    statusRepository.rows.set(1, row())
    const service = createService(vi.fn().mockRejectedValue(new Error('bad XRef entry')))

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-apuntes.txt', fileName: 'apuntes.txt' })
    await service.whenIdle()

    expect(chunkStore.replaceChunks).not.toHaveBeenCalled()
    expect(statusRepository.get(1)?.indexStatus).toBe('not-indexable')
    expect(notifyStatusChanged).toHaveBeenCalledWith(10)
  })

  it('extraction resolving to an empty string transitions the row to not-indexable (design: empty text -> not-indexable)', async () => {
    statusRepository.rows.set(1, row())
    const service = createService(vi.fn().mockResolvedValue(''))

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-apuntes.txt', fileName: 'apuntes.txt' })
    await service.whenIdle()

    expect(chunkStore.replaceChunks).not.toHaveBeenCalled()
    expect(statusRepository.get(1)?.indexStatus).toBe('not-indexable')
  })

  it('idempotent re-run: indexing an already-indexed row again calls replaceChunks (atomic swap), never a bare insert that could duplicate rows (spec: Re-indexing is idempotent)', async () => {
    statusRepository.rows.set(1, row({ indexStatus: 'indexed' }))
    const service = createService(vi.fn().mockResolvedValue('contenido actualizado'))

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-apuntes.txt', fileName: 'apuntes.txt' })
    await service.whenIdle()

    expect(chunkStore.insertMany).not.toHaveBeenCalled()
    expect(chunkStore.replaceChunks).toHaveBeenCalledTimes(1)
    expect(statusRepository.get(1)?.indexStatus).toBe('indexed')
  })

  it('processes two enqueued jobs strictly one at a time (concurrency 1) — the second never starts before the first finishes', async () => {
    statusRepository.rows.set(1, row({ id: 1, subjectId: 10 }))
    statusRepository.rows.set(2, row({ id: 2, subjectId: 20, fileName: 'otro.txt', storedPath: '20/uuid-otro.txt' }))
    const order: string[] = []
    const firstJobStarted = createDeferred<void>()
    const releaseFirstJob = createDeferred<string>()

    const extract: ExtractFn = vi.fn(async (_format, absolutePath: string) => {
      if (absolutePath.includes('apuntes')) {
        order.push('job1-start')
        firstJobStarted.resolve()
        const text = await releaseFirstJob.promise
        order.push('job1-end')
        return text
      }
      order.push('job2-start')
      order.push('job2-end')
      return 'contenido del segundo archivo'
    })
    const service = createService(extract)

    service.enqueue({ attachmentId: 1, subjectId: 10, storedPath: '10/uuid-apuntes.txt', fileName: 'apuntes.txt' })
    service.enqueue({ attachmentId: 2, subjectId: 20, storedPath: '20/uuid-otro.txt', fileName: 'otro.txt' })

    await firstJobStarted.promise
    // job2 must NOT have started yet — job1 is still awaiting `releaseFirstJob`.
    expect(order).toEqual(['job1-start'])

    releaseFirstJob.resolve('contenido del primer archivo')
    await service.whenIdle()

    expect(order).toEqual(['job1-start', 'job1-end', 'job2-start', 'job2-end'])
  })
})
