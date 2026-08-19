import path from 'node:path'
import * as nodeFs from 'node:fs/promises'
import { resolveAttachmentPath } from '../domain/attachmentPaths'

/**
 * The exact subset of `node:fs/promises` this module needs — narrow enough
 * to mock trivially in tests, wide enough that the default export can be
 * passed through unmodified (design "Storage port").
 */
export interface AttachmentFsSubset {
  stat(path: string): Promise<{ size: number }>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>
  copyFile(src: string, dest: string): Promise<void>
  unlink(path: string): Promise<void>
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
}

export interface AttachmentStorage {
  /** Byte size of an arbitrary file (picker-selected source, or a resolved attachment). Rejects if it cannot be stat'd (e.g. missing). */
  statSize(sourcePath: string): Promise<number>
  /** Ensures `rootDir/subjectId` exists, copies `sourcePath` into it as `storedFileName`, and returns the storedPath RELATIVE to `rootDir`. */
  copyIntoSubjectDir(subjectId: number, sourcePath: string, storedFileName: string): Promise<string>
  /** The single choke point that turns a stored (relative) path back into an absolute one. Throws `INVALID_PATH` on escape (see `attachmentPaths.ts`). */
  resolveStoredPath(storedPath: string): string
  /** Resolves the storedPath and unlinks it. Propagates any failure (missing file, locked file) — callers decide how to log/report it. */
  removeFile(storedPath: string): Promise<void>
  /** Best-effort, recursive removal of a subject's whole attachment directory (`fs.rm` with `force: true`, so a missing directory is not an error). */
  removeSubjectDir(subjectId: number): Promise<void>
}

interface CreateAttachmentStorageOptions {
  rootDir: string
  fs?: AttachmentFsSubset
}

/**
 * File-backed implementation of the attachment storage port (design
 * "Storage port"). `rootDir` is injected — `app.getPath('userData')/
 * attachments` is resolved ONLY in `src/main/index.ts`, so this module never
 * imports Electron and stays testable with a mocked fs and a plain string
 * root.
 */
export function createAttachmentStorage({ rootDir, fs = nodeFs }: CreateAttachmentStorageOptions): AttachmentStorage {
  return {
    async statSize(sourcePath) {
      const stats = await fs.stat(sourcePath)
      return stats.size
    },
    async copyIntoSubjectDir(subjectId, sourcePath, storedFileName) {
      const subjectDir = String(subjectId)
      await fs.mkdir(path.join(rootDir, subjectDir), { recursive: true })
      const storedPath = path.join(subjectDir, storedFileName)
      await fs.copyFile(sourcePath, path.join(rootDir, storedPath))
      return storedPath
    },
    resolveStoredPath(storedPath) {
      return resolveAttachmentPath(rootDir, storedPath)
    },
    async removeFile(storedPath) {
      const absolutePath = resolveAttachmentPath(rootDir, storedPath)
      await fs.unlink(absolutePath)
    },
    async removeSubjectDir(subjectId) {
      await fs.rm(path.join(rootDir, String(subjectId)), { recursive: true, force: true })
    }
  }
}
