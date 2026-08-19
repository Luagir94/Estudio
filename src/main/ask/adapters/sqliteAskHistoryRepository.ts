import { asc, desc, eq } from 'drizzle-orm'
import type { AskResult, Citation, CitationSection } from '../../../shared/ipc/ask'
import type { AppDatabase } from '../../db/connection'
import { askMessageCitations, askMessages, conversations } from '../../db/schema'
import { ASK_TITLE_MAX_CHARS } from '../domain/limits'

export interface ConversationSummary {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export interface AskHistoryMessage {
  id: number
  question: string
  /** Read-side: plain string (design D5) — a persisted row must outlive the current write-side model enum. */
  model: string
  result: AskResult
  createdAt: string
}

export interface ConversationWithMessages {
  conversation: ConversationSummary
  /** Chronological order (spec "Load returns full transcript"). */
  messages: AskHistoryMessage[]
}

export interface AppendTurnInput {
  /** `null` starts a new conversation; an existing id appends to it and touches its `updatedAt`. */
  conversationId: number | null
  question: string
  /** Write-side model key — the caller (askService) already validated it against `askModelSchema`. */
  model: string
  result: AskResult
  /** Local-naive `yyyy-MM-dd'T'HH:mm`, computed by the caller (same convention as `attachmentService.ts`). */
  createdAt: string
}

export interface AppendTurnResult {
  conversationId: number
  messageId: number
}

export interface AskHistoryRepository {
  /**
   * Writes a completed turn (spec "Write-on-Completion Turn Persistence")
   * atomically: creates the conversation when `conversationId` is `null`
   * (deriving its title), otherwise touches the existing conversation's
   * `updatedAt`; then inserts the message and its citations. The whole
   * operation runs in ONE drizzle transaction — any failure (including a
   * malformed citation or a `conversationId` that no longer exists) rolls
   * back everything, leaving no partial row.
   */
  appendTurn(input: AppendTurnInput): AppendTurnResult
  /** Ordered `updatedAt DESC, id DESC` — the id tiebreak matters because timestamps only carry minute precision. */
  listConversations(): ConversationSummary[]
  /** Null if not found. */
  getConversation(id: number): ConversationWithMessages | null
  /** `false` and deletes nothing if not found. Cascade removes its messages and citations (`ON DELETE CASCADE`). */
  deleteConversation(id: number): boolean
}

function deriveTitle(question: string): string {
  return question.length <= ASK_TITLE_MAX_CHARS ? question : question.slice(0, ASK_TITLE_MAX_CHARS)
}

interface CitationInsertValues {
  kind: string
  subject: string | null
  file: string | null
  section: string | null
  label: string | null
}

function toCitationInsertValues(citation: Citation): CitationInsertValues {
  if (citation.kind === 'archivo') {
    return { kind: 'archivo', subject: citation.subject, file: citation.file, section: null, label: null }
  }
  if (citation.kind === 'dato') {
    return { kind: 'dato', subject: null, file: null, section: citation.section, label: citation.label }
  }
  // SQLite has no enums; an unrecognised citation kind means the value was
  // produced by something other than the validated `citationSchema` union —
  // corruption worth failing loudly on, same rule as
  // `sqliteSubjectRepository.ts`'s `toOutcome`/`toFinalResult`. Throwing
  // BEFORE any citation row is written also proves `appendTurn`'s
  // atomicity: the whole transaction, including the message and any
  // freshly-created conversation, rolls back with it.
  throw new Error(`Unknown citation kind "${(citation as { kind: string }).kind}"`)
}

interface CitationRow {
  kind: string
  subject: string | null
  file: string | null
  section: string | null
  label: string | null
}

function toCitation(row: CitationRow): Citation {
  if (row.kind === 'archivo') {
    return { kind: 'archivo', subject: row.subject ?? '', file: row.file ?? '' }
  }
  if (row.kind === 'dato') {
    return { kind: 'dato', section: (row.section ?? 'materias') as CitationSection, label: row.label ?? '' }
  }
  throw new Error(`Unknown persisted citation kind "${row.kind}"`)
}

interface MessageRow {
  id: number
  question: string
  kind: string
  answer: string | null
  model: string
  createdAt: string
}

function toAskResult(kind: string, answer: string | null, citations: Citation[]): AskResult {
  if (kind === 'answer') {
    return { kind: 'answer', answer: answer ?? '', citations }
  }
  if (kind === 'general') {
    return { kind: 'general', answer: answer ?? '' }
  }
  if (kind === 'not-found') {
    return { kind: 'not-found' }
  }
  // Same corruption-is-not-coerced rule as `toCitation` above.
  throw new Error(`Unknown persisted ask-message kind "${kind}"`)
}

/**
 * SQLite-backed implementation of the ask-history port (design D4). Module-
 * level helper functions plus a `createSqliteAskHistoryRepository(db)`
 * factory — the same shape as `sqliteDeadlineRepository.ts`.
 */
export function createSqliteAskHistoryRepository(db: AppDatabase): AskHistoryRepository {
  return {
    appendTurn(input) {
      return db.transaction((tx) => {
        let conversationId = input.conversationId

        if (conversationId === null) {
          const insertedConversation = tx
            .insert(conversations)
            .values({
              title: deriveTitle(input.question),
              createdAt: input.createdAt,
              updatedAt: input.createdAt
            })
            .returning()
            .get()
          conversationId = insertedConversation.id
        } else {
          tx.update(conversations).set({ updatedAt: input.createdAt }).where(eq(conversations.id, conversationId)).run()
        }

        const insertedMessage = tx
          .insert(askMessages)
          .values({
            conversationId,
            question: input.question,
            kind: input.result.kind,
            answer: input.result.kind === 'not-found' ? null : input.result.answer,
            model: input.model,
            createdAt: input.createdAt
          })
          .returning()
          .get()

        if (input.result.kind === 'answer') {
          for (const citation of input.result.citations) {
            tx.insert(askMessageCitations)
              .values({ messageId: insertedMessage.id, ...toCitationInsertValues(citation) })
              .run()
          }
        }

        return { conversationId, messageId: insertedMessage.id }
      })
    },
    listConversations() {
      return db.select().from(conversations).orderBy(desc(conversations.updatedAt), desc(conversations.id)).all()
    },
    getConversation(id) {
      const conversation = db.select().from(conversations).where(eq(conversations.id, id)).get()
      if (!conversation) {
        return null
      }

      const messageRows: MessageRow[] = db
        .select()
        .from(askMessages)
        .where(eq(askMessages.conversationId, id))
        .orderBy(asc(askMessages.id))
        .all()

      const messages = messageRows.map((row) => {
        const citationRows: CitationRow[] = db
          .select()
          .from(askMessageCitations)
          .where(eq(askMessageCitations.messageId, row.id))
          .orderBy(asc(askMessageCitations.id))
          .all()

        return {
          id: row.id,
          question: row.question,
          model: row.model,
          result: toAskResult(row.kind, row.answer, citationRows.map(toCitation)),
          createdAt: row.createdAt
        }
      })

      return { conversation, messages }
    },
    deleteConversation(id) {
      const existing = db.select().from(conversations).where(eq(conversations.id, id)).get()
      if (!existing) {
        return false
      }
      // ONLY the conversation row is deleted here. Messages and citations
      // are removed by the FK's `ON DELETE CASCADE` — deliberate, same
      // rationale as `sqliteSubjectRepository.ts`'s `remove`.
      db.delete(conversations).where(eq(conversations.id, id)).run()
      return true
    }
  }
}
