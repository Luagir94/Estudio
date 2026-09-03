import log from 'electron-log'
import type { DeleteSubjectResult } from '../../shared/ipc/materias'
import type { AttachmentStorage } from '../adjuntos/adapters/fileAttachmentStorage'
import type { SubjectRepository } from './adapters/sqliteSubjectRepository'

export interface MateriasService {
  /**
   * Deletes the subject row, then best-effort removes its whole attachment
   * directory (spec "Subject Deletion Cascades to Attachments"). `null` when
   * no subject with `id` exists — no cleanup is attempted in that case.
   */
  deleteSubject(id: number): Promise<DeleteSubjectResult | null>
}

interface CreateMateriasServiceDeps {
  repository: SubjectRepository
  attachmentStorage: AttachmentStorage
}

/**
 * Extracted from `registerMateriasHandlers.ts`'s `materias:delete` (mcp-app-
 * control design D5): it was the only curated handler orchestrating more
 * than parse → repository → envelope. Isolating the row-then-directory
 * cascade here lets both the IPC handler and the future `materias_delete`
 * MCP tool call the exact same sequence instead of duplicating it — a
 * subject deleted over MCP would otherwise leave its attachment directory
 * orphaned.
 */
export function createMateriasService({ repository, attachmentStorage }: CreateMateriasServiceDeps): MateriasService {
  return {
    async deleteSubject(id) {
      const result = repository.remove(id)
      if (!result) {
        return null
      }

      // The `await` here is mandatory: without it, a rejection from
      // `removeSubjectDir` becomes an unhandled promise rejection instead of
      // reaching this catch. Best-effort ONLY — a locked or missing
      // directory must never block or reverse the subject deletion that
      // already committed above.
      try {
        await attachmentStorage.removeSubjectDir(id)
      } catch (cleanupError) {
        log.warn(
          `Failed to remove attachment directory for subject ${id}: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`
        )
      }

      return result
    }
  }
}
