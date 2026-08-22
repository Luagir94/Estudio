import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AttachmentFsSubset } from './fileAttachmentStorage'
import { createAttachmentStorage } from './fileAttachmentStorage'

const rootDir = path.join('C:', 'userData', 'attachments')

function createFsMock(overrides: Partial<AttachmentFsSubset> = {}): AttachmentFsSubset {
  return {
    stat: vi.fn().mockResolvedValue({ size: 0 }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

// `createAttachmentStorage` takes its fs subset by injection (design
// "Storage port") — every test here uses a mocked fs and a plain string
// root, proving the module itself never touches Electron or a real disk.
describe('createAttachmentStorage', () => {
  it('statSize resolves the byte size of an arbitrary source path via fs.stat', async () => {
    const fs = createFsMock({ stat: vi.fn().mockResolvedValue({ size: 4096 }) })
    const storage = createAttachmentStorage({ rootDir, fs })

    const size = await storage.statSize(path.join('C:', 'Users', 'lucho', 'apuntes.pdf'))

    expect(size).toBe(4096)
    expect(fs.stat).toHaveBeenCalledWith(path.join('C:', 'Users', 'lucho', 'apuntes.pdf'))
  })

  it('statSize propagates a stat failure (e.g. ENOENT) instead of swallowing it', async () => {
    const fs = createFsMock({ stat: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')) })
    const storage = createAttachmentStorage({ rootDir, fs })

    await expect(storage.statSize(path.join('C:', 'gone.pdf'))).rejects.toThrow('ENOENT')
  })

  it('copyIntoSubjectDir creates the subject directory then copies the source file into it', async () => {
    const fs = createFsMock()
    const storage = createAttachmentStorage({ rootDir, fs })
    const sourcePath = path.join('C:', 'Users', 'lucho', 'apuntes.pdf')

    const storedPath = await storage.copyIntoSubjectDir(7, sourcePath, 'uuid-apuntes.pdf')

    expect(fs.mkdir).toHaveBeenCalledWith(path.join(rootDir, '7'), { recursive: true })
    expect(fs.copyFile).toHaveBeenCalledWith(sourcePath, path.join(rootDir, '7', 'uuid-apuntes.pdf'))
    expect(storedPath).toBe(path.join('7', 'uuid-apuntes.pdf'))
  })

  // cli-generated-artifacts Unit 6.1 — mirrors `copyIntoSubjectDir` for a
  // content STRING (the ask-generated write path) instead of a source file.
  it('writeIntoSubjectDir creates the subject directory then writes the content string into it as UTF-8', async () => {
    const fs = createFsMock()
    const storage = createAttachmentStorage({ rootDir, fs })

    const storedPath = await storage.writeIntoSubjectDir(7, 'uuid-resumen.md', 'Contenido del resumen.')

    expect(fs.mkdir).toHaveBeenCalledWith(path.join(rootDir, '7'), { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join(rootDir, '7', 'uuid-resumen.md'),
      'Contenido del resumen.',
      'utf8'
    )
    expect(storedPath).toBe(path.join('7', 'uuid-resumen.md'))
  })

  it('resolveStoredPath resolves a normal storedPath to an absolute path under the root', () => {
    const storage = createAttachmentStorage({ rootDir, fs: createFsMock() })

    expect(storage.resolveStoredPath(path.join('7', 'uuid-apuntes.pdf'))).toBe(
      path.join(rootDir, '7', 'uuid-apuntes.pdf')
    )
  })

  it('resolveStoredPath throws INVALID_PATH for a storedPath that escapes the root', () => {
    const storage = createAttachmentStorage({ rootDir, fs: createFsMock() })

    expect(() => storage.resolveStoredPath(path.join('..', 'attachments-evil', 'payload.txt'))).toThrow('INVALID_PATH')
  })

  it('removeFile resolves the storedPath and unlinks the resulting absolute path', async () => {
    const fs = createFsMock()
    const storage = createAttachmentStorage({ rootDir, fs })

    await storage.removeFile(path.join('7', 'uuid-apuntes.pdf'))

    expect(fs.unlink).toHaveBeenCalledWith(path.join(rootDir, '7', 'uuid-apuntes.pdf'))
  })

  it('removeFile propagates an unlink failure rather than swallowing it — callers decide how to log it', async () => {
    const fs = createFsMock({ unlink: vi.fn().mockRejectedValue(new Error('EBUSY: file is locked')) })
    const storage = createAttachmentStorage({ rootDir, fs })

    await expect(storage.removeFile(path.join('7', 'uuid-apuntes.pdf'))).rejects.toThrow('EBUSY')
  })

  it('removeSubjectDir recursively removes the whole subject directory, forcing through missing paths', async () => {
    const fs = createFsMock()
    const storage = createAttachmentStorage({ rootDir, fs })

    await storage.removeSubjectDir(7)

    expect(fs.rm).toHaveBeenCalledWith(path.join(rootDir, '7'), { recursive: true, force: true })
  })
})
