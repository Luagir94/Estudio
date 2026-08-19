import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import { openAppDatabase } from '../../db/connection'
import type { AskResult, Citation } from '../../../shared/ipc/ask'
import { createSqliteAskHistoryRepository } from './sqliteAskHistoryRepository'

const migrationsFolder = path.join(__dirname, '../../../../drizzle/migrations')

/**
 * Every test goes through the PRODUCTION connection factory
 * (`openAppDatabase`) and the PRODUCTION migrator — not a hand-rolled raw
 * connection — so the `foreign_keys` pragma that makes `ON DELETE CASCADE`
 * work is actually exercised (same pattern as
 * `sqliteAttachmentRepository.test.ts`/`sqliteSubjectRepository.test.ts`).
 */
function createTestDb() {
  const { db, raw } = openAppDatabase(':memory:')
  migrate(db, { migrationsFolder })
  return { db, raw }
}

const ANSWER_RESULT: AskResult = {
  kind: 'answer',
  answer: 'Es un escrito que inicia el proceso.',
  citations: [{ kind: 'archivo', subject: 'Derecho Procesal', file: 'apunte.pdf' }]
}

const GENERAL_RESULT: AskResult = {
  kind: 'general',
  answer: 'En términos generales, una demanda es...'
}

const NOT_FOUND_RESULT: AskResult = { kind: 'not-found' }

describe('createSqliteAskHistoryRepository', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let raw: ReturnType<typeof createTestDb>['raw']

  beforeEach(() => {
    ;({ db, raw } = createTestDb())
  })

  describe('appendTurn', () => {
    it('creates a new conversation and message when conversationId is null', () => {
      const repository = createSqliteAskHistoryRepository(db)

      const result = repository.appendTurn({
        conversationId: null,
        question: '¿Qué es una demanda?',
        model: 'sonnet',
        result: ANSWER_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      expect(typeof result.conversationId).toBe('number')
      expect(typeof result.messageId).toBe('number')

      const conversationRow = raw.prepare('SELECT * FROM conversations WHERE id = ?').get(result.conversationId) as {
        title: string
        created_at: string
        updated_at: string
      }
      expect(conversationRow.title).toBe('¿Qué es una demanda?')
      expect(conversationRow.created_at).toBe('2026-08-18T10:00')
      expect(conversationRow.updated_at).toBe('2026-08-18T10:00')
    })

    it('appends to an existing conversation and touches its updatedAt instead of creating a new one', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const first = repository.appendTurn({
        conversationId: null,
        question: '¿Qué es una demanda?',
        model: 'sonnet',
        result: ANSWER_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      const second = repository.appendTurn({
        conversationId: first.conversationId,
        question: '¿Y una contestación?',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:05'
      })

      expect(second.conversationId).toBe(first.conversationId)
      const conversationCount = raw.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
        count: number
      }
      expect(conversationCount.count).toBe(1)
      const conversationRow = raw
        .prepare('SELECT updated_at FROM conversations WHERE id = ?')
        .get(first.conversationId) as {
        updated_at: string
      }
      expect(conversationRow.updated_at).toBe('2026-08-18T10:05')
    })

    it('persists citations for an answer result, discriminated by kind', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const result = repository.appendTurn({
        conversationId: null,
        question: '¿Cuál es mi promedio?',
        model: 'opus',
        result: {
          kind: 'answer',
          answer: 'Tu promedio es 8.',
          citations: [
            { kind: 'archivo', subject: 'Materia', file: 'boletin.pdf' },
            { kind: 'dato', section: 'materias', label: 'Promedio' }
          ]
        },
        createdAt: '2026-08-18T11:00'
      })

      const citationRows = raw
        .prepare('SELECT * FROM ask_message_citations WHERE message_id = ? ORDER BY id ASC')
        .all(result.messageId) as {
        kind: string
        subject: string | null
        file: string | null
        section: string | null
        label: string | null
      }[]

      expect(citationRows).toHaveLength(2)
      expect(citationRows[0]).toMatchObject({
        kind: 'archivo',
        subject: 'Materia',
        file: 'boletin.pdf',
        section: null,
        label: null
      })
      expect(citationRows[1]).toMatchObject({
        kind: 'dato',
        subject: null,
        file: null,
        section: 'materias',
        label: 'Promedio'
      })
    })

    it('writes no citation rows for a general or not-found result', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const general = repository.appendTurn({
        conversationId: null,
        question: 'Contame un chiste',
        model: 'haiku',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T12:00'
      })
      const notFound = repository.appendTurn({
        conversationId: general.conversationId,
        question: '¿Qué dice el reglamento sobre X?',
        model: 'haiku',
        result: NOT_FOUND_RESULT,
        createdAt: '2026-08-18T12:01'
      })

      const citationCount = raw.prepare('SELECT COUNT(*) as count FROM ask_message_citations').get() as {
        count: number
      }
      expect(citationCount.count).toBe(0)
      const notFoundRow = raw.prepare('SELECT answer FROM ask_messages WHERE id = ?').get(notFound.messageId) as {
        answer: string | null
      }
      expect(notFoundRow.answer).toBeNull()
    })

    it('rolls back the whole transaction (conversation and message) when a citation is malformed', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const hostileCitation = { kind: 'invalid' } as unknown as Citation

      expect(() =>
        repository.appendTurn({
          conversationId: null,
          question: '¿Qué es una demanda?',
          model: 'sonnet',
          result: { kind: 'answer', answer: 'Es...', citations: [hostileCitation] },
          createdAt: '2026-08-18T10:00'
        })
      ).toThrow()

      const conversationCount = raw.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
        count: number
      }
      const messageCount = raw.prepare('SELECT COUNT(*) as count FROM ask_messages').get() as { count: number }
      const citationCount = raw.prepare('SELECT COUNT(*) as count FROM ask_message_citations').get() as {
        count: number
      }
      expect(conversationCount.count).toBe(0)
      expect(messageCount.count).toBe(0)
      expect(citationCount.count).toBe(0)
    })

    it('rolls back the whole transaction when the target conversation no longer exists', () => {
      const repository = createSqliteAskHistoryRepository(db)

      expect(() =>
        repository.appendTurn({
          conversationId: 999,
          question: '¿Seguimos?',
          model: 'sonnet',
          result: GENERAL_RESULT,
          createdAt: '2026-08-18T10:00'
        })
      ).toThrow()

      const messageCount = raw.prepare('SELECT COUNT(*) as count FROM ask_messages').get() as { count: number }
      expect(messageCount.count).toBe(0)
    })

    it('derives the title from the first question, truncated to 80 chars', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const longQuestion = 'x'.repeat(120)

      const result = repository.appendTurn({
        conversationId: null,
        question: longQuestion,
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      const conversationRow = raw
        .prepare('SELECT title FROM conversations WHERE id = ?')
        .get(result.conversationId) as {
        title: string
      }
      expect(conversationRow.title).toHaveLength(80)
      expect(conversationRow.title).toBe('x'.repeat(80))
    })

    it('does not truncate a question already within the 80-char limit', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const shortQuestion = '¿Qué es una demanda?'

      const result = repository.appendTurn({
        conversationId: null,
        question: shortQuestion,
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      const conversationRow = raw
        .prepare('SELECT title FROM conversations WHERE id = ?')
        .get(result.conversationId) as {
        title: string
      }
      expect(conversationRow.title).toBe(shortQuestion)
    })
  })

  describe('listConversations', () => {
    it('orders by updatedAt DESC, id DESC (the id tiebreak for minute-precision ties)', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const older = repository.appendTurn({
        conversationId: null,
        question: 'Primera',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:00'
      })
      // Same minute-precision timestamp as `older` — the id must break the tie.
      const newer = repository.appendTurn({
        conversationId: null,
        question: 'Segunda',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      const listed = repository.listConversations()

      expect(listed.map((conversation) => conversation.id)).toEqual([newer.conversationId, older.conversationId])
    })

    it('reflects a touched updatedAt: continuing an older conversation moves it to the front', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const first = repository.appendTurn({
        conversationId: null,
        question: 'Primera',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:00'
      })
      const second = repository.appendTurn({
        conversationId: null,
        question: 'Segunda',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:01'
      })
      repository.appendTurn({
        conversationId: first.conversationId,
        question: 'Continuando la primera',
        model: 'sonnet',
        result: GENERAL_RESULT,
        createdAt: '2026-08-18T10:02'
      })

      const listed = repository.listConversations()

      expect(listed.map((conversation) => conversation.id)).toEqual([first.conversationId, second.conversationId])
    })

    it('returns an empty array when no conversations exist', () => {
      const repository = createSqliteAskHistoryRepository(db)
      expect(repository.listConversations()).toEqual([])
    })
  })

  describe('getConversation', () => {
    it('returns the full transcript in chronological order with citations attached', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const first = repository.appendTurn({
        conversationId: null,
        question: '¿Qué es una demanda?',
        model: 'sonnet',
        result: ANSWER_RESULT,
        createdAt: '2026-08-18T10:00'
      })
      repository.appendTurn({
        conversationId: first.conversationId,
        question: '¿Y una excepción?',
        model: 'sonnet',
        result: NOT_FOUND_RESULT,
        createdAt: '2026-08-18T10:05'
      })

      const loaded = repository.getConversation(first.conversationId)

      expect(loaded).not.toBeNull()
      expect(loaded?.conversation.id).toBe(first.conversationId)
      expect(loaded?.messages).toHaveLength(2)
      expect(loaded?.messages[0]).toMatchObject({
        question: '¿Qué es una demanda?',
        model: 'sonnet',
        result: ANSWER_RESULT
      })
      expect(loaded?.messages[1]).toMatchObject({
        question: '¿Y una excepción?',
        result: { kind: 'not-found' }
      })
    })

    it('returns null for a conversation id that does not exist', () => {
      const repository = createSqliteAskHistoryRepository(db)
      expect(repository.getConversation(999)).toBeNull()
    })
  })

  describe('deleteConversation', () => {
    it('cascade-deletes messages and citations when a conversation is deleted', () => {
      const repository = createSqliteAskHistoryRepository(db)
      const created = repository.appendTurn({
        conversationId: null,
        question: '¿Cuál es mi promedio?',
        model: 'sonnet',
        result: ANSWER_RESULT,
        createdAt: '2026-08-18T10:00'
      })

      const deleted = repository.deleteConversation(created.conversationId)

      expect(deleted).toBe(true)
      const conversationCount = raw.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
        count: number
      }
      const messageCount = raw.prepare('SELECT COUNT(*) as count FROM ask_messages').get() as { count: number }
      const citationCount = raw.prepare('SELECT COUNT(*) as count FROM ask_message_citations').get() as {
        count: number
      }
      // Prove the CASCADE actually ran on the production connection (not
      // just that the repository's own filter hides them), same rationale
      // as `sqliteAttachmentRepository.test.ts`'s cascade test.
      expect(conversationCount.count).toBe(0)
      expect(messageCount.count).toBe(0)
      expect(citationCount.count).toBe(0)
    })

    it('returns false and deletes nothing for a conversation id that does not exist', () => {
      const repository = createSqliteAskHistoryRepository(db)
      expect(repository.deleteConversation(999)).toBe(false)
    })
  })
})
