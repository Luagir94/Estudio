import { describe, expect, it } from 'vitest'
import { buildRetrievalQuery } from './retrievalQuery'
import type { TranscriptSourceTurn } from './transcriptWindow'

// A follow-up like "¿Podés detallar cada uno?" carries no content keywords of
// its own — searched verbatim, BM25 matches nothing, the prompt ships with no
// retrieval section, and the model honestly answers not-found even though the
// topic sits one turn away in the transcript. These tests pin the fix: the
// RETRIEVAL QUERY borrows the newest answered turn's text, and only the
// retrieval query — what the model actually reads is composed elsewhere and
// stays untouched.

const QUESTION = '¿Podés detallar cada uno?'

function answeredTurn(messageId: number, question: string, answer: string): TranscriptSourceTurn {
  return { messageId, question, result: { kind: 'general', answer } }
}

function notFoundTurn(messageId: number, question: string): TranscriptSourceTurn {
  return { messageId, question, result: { kind: 'not-found' } }
}

describe('buildRetrievalQuery', () => {
  it('returns the question unchanged when there is no transcript', () => {
    expect(buildRetrievalQuery(QUESTION, [])).toBe(QUESTION)
  })

  it("appends the newest answered turn's question and answer after the question", () => {
    const transcript = [answeredTurn(1, '¿Qué sistemas empresariales se mencionan?', 'Se mencionan ERP, CRM y SCM.')]

    const query = buildRetrievalQuery(QUESTION, transcript)

    expect(query.startsWith(QUESTION)).toBe(true)
    expect(query).toContain('¿Qué sistemas empresariales se mencionan?')
    expect(query).toContain('Se mencionan ERP, CRM y SCM.')
  })

  it('borrows from an answer-kind turn the same way as a general one', () => {
    const transcript: TranscriptSourceTurn[] = [
      {
        messageId: 1,
        question: '¿Qué proveedores lista el capítulo?',
        result: {
          kind: 'answer',
          answer: 'Lista IBM DB2, Oracle y SQL Server.',
          citations: [{ kind: 'archivo', subject: 'ITICS', file: 'sig.pdf' }]
        }
      }
    ]

    const query = buildRetrievalQuery(QUESTION, transcript)

    expect(query).toContain('IBM DB2, Oracle y SQL Server')
  })

  it('borrows only the newest answered turn, never older ones', () => {
    const transcript = [
      answeredTurn(1, '¿Qué es un anillo?', 'Una estructura algebraica con dos operaciones.'),
      answeredTurn(2, '¿Qué sistemas empresariales se mencionan?', 'Se mencionan ERP, CRM y SCM.')
    ]

    const query = buildRetrievalQuery(QUESTION, transcript)

    expect(query).toContain('ERP, CRM y SCM')
    expect(query).not.toContain('estructura algebraica')
  })

  // A not-found turn contributed no corpus-grounded text — its question
  // already failed to surface anything once, so replaying it would seed the
  // query with proven-useless tokens instead of the topic the student is
  // actually following up on.
  it('skips trailing not-found turns to reach the newest answered turn', () => {
    const transcript = [
      answeredTurn(1, '¿Qué sistemas empresariales se mencionan?', 'Se mencionan ERP, CRM y SCM.'),
      notFoundTurn(2, '¿Podés detallar cada uno?')
    ]

    const query = buildRetrievalQuery(QUESTION, transcript)

    expect(query).toContain('ERP, CRM y SCM')
  })

  it('returns the question unchanged when every prior turn is not-found', () => {
    const transcript = [notFoundTurn(1, '¿Qué dice el apunte sobre grafos?')]

    expect(buildRetrievalQuery(QUESTION, transcript)).toBe(QUESTION)
  })

  it('truncates the borrowed context at the cap, never the question itself', () => {
    const transcript = [answeredTurn(1, 'abcdef', 'ghijkl')]

    const query = buildRetrievalQuery(QUESTION, transcript, 4)

    expect(query).toBe(`${QUESTION}\nabcd`)
  })
})
