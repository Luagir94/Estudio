import { describe, expect, it } from 'vitest'
import { stripAttachmentEcho } from './attachmentEchoFilter'

// A question that echoes an attachment's title poisons BM25: title tokens are
// the RAREST in the corpus (they live in front matter, not in the chapters),
// and `ftsQuery.ts` OR-joins every token with equal weight — so "resumime
// Sistemas de Informacion Gerencial" ranked front-matter chunks over the
// mid-book content the student was actually asking about. Replay evidence:
// the exact stored question returned top-6 chunk_index {1, 2037, 54, 0, 2,
// 88} (5/6 front matter); the same question minus the title echo returned all
// mid-book. These tests pin the fix: filename-echo tokens are stripped from
// the RETRIEVAL QUERY only — the question line the model reads is composed
// elsewhere and stays untouched.

const BOOK = 'Sistemas de Informacion Gerencial - 12va Edicion.pdf'

describe('stripAttachmentEcho', () => {
  it('drops query tokens that exactly match filename tokens, including the extension token', () => {
    expect(stripAttachmentEcho('que tipos de sistemas describe el libro pdf', [BOOK])).toBe(
      'que tipos describe el libro'
    )
  })

  // The FTS table tokenizes with `unicode61 remove_diacritics 2`, so
  // "Edición" and "edicion" are the SAME indexed token — the echo test must
  // fold the same way, in both directions.
  it('folds accents on the question side ("edición" echoes filename "Edicion")', () => {
    expect(stripAttachmentEcho('resumime la edición completa', [BOOK])).toBe('resumime la completa')
  })

  it('folds accents on the filename side ("edicion" echoes filename "Edición")', () => {
    expect(stripAttachmentEcho('cual edicion es', ['Edición.pdf'])).toBe('cual es')
  })

  it('folds case before comparing', () => {
    expect(stripAttachmentEcho('SISTEMAS y GERENCIAL en resumen', [BOOK])).toBe('y en resumen')
  })

  // The production-observed typo class: the user typed "istemas", the chunker
  // had minted "istemas" fragments at 1000-char cut points (df=6), and that
  // fake-rare token pulled front-matter-adjacent junk into the top-6.
  it('drops a typo fragment that is a substring of a filename token ("istemas" vs "Sistemas")', () => {
    expect(stripAttachmentEcho('que son los istemas transaccionales', [BOOK])).toBe('que son los transaccionales')
  })

  it('drops a query token that CONTAINS a filename token (plural over singular)', () => {
    expect(stripAttachmentEcho('los sistemas expertos', ['sistema.pdf'])).toBe('los expertos')
  })

  // The >=4 floor: "ion" IS a substring of "Informacion" and "Edicion", but a
  // 3-char token must never be substring-dropped — only the exact rule may
  // drop short tokens, which is how "de" (a literal filename token) goes.
  it('never substring-drops a short token, while exact still drops short filename tokens', () => {
    expect(stripAttachmentEcho('ion de datos', [BOOK])).toBe('ion datos')
  })

  it('keeps short stopwords that are not literal filename tokens ("el" survives, "de" is exact-dropped)', () => {
    expect(stripAttachmentEcho('el resumen de todo', [BOOK])).toBe('el resumen todo')
  })

  it('drops numeric-ish tokens by exact match ("12va")', () => {
    expect(stripAttachmentEcho('capitulo 12va parte', [BOOK])).toBe('capitulo parte')
  })

  // No echo at all: the query must come back BYTE-IDENTICAL (punctuation
  // intact), not re-tokenized — callers comparing exact strings rely on it.
  it('returns the original string unchanged when no token echoes (content words survive)', () => {
    const question = '¿Qué rol cumplen los TPS en la gestión, cuando existen conflictos?'

    expect(stripAttachmentEcho(question, [BOOK])).toBe(question)
  })

  // A title-only question must still search SOMETHING: front-matter results
  // for "resumime <title>" are acceptable and intended, zero results are not.
  it('falls back to the original query when every token is an echo', () => {
    const question = 'Sistemas de Informacion Gerencial pdf'

    expect(stripAttachmentEcho(question, [BOOK])).toBe(question)
  })

  // Files are routinely named after their TOPIC ("grafos.pdf", the book's own
  // title), so a filename token is not reliably identity — when the echo rule
  // would eat the question's ONLY content word, stripping ships a stopword-only
  // query whose BM25 scores collapse (~-0.000004, no discrimination) and the
  // top-K fills with junk. The fallback must test for zero CONTENT-BEARING
  // survivors (folded length >= substring floor), not zero survivors.
  it('falls back to the original query when stripping would leave only stopword-length tokens', () => {
    const question = '¿Qué es un sistema?'

    expect(stripAttachmentEcho(question, [BOOK])).toBe(question)
  })

  it('falls back when the only content word is a substring of a filename token ("gerencia" vs "Gerencial")', () => {
    const question = '¿qué es la gerencia?'

    expect(stripAttachmentEcho(question, [BOOK])).toBe(question)
  })

  it('falls back for a topic-named filename that plural-matches the question ("grafos.pdf" vs "grafo")', () => {
    const question = '¿Qué es un grafo?'

    expect(stripAttachmentEcho(question, ['grafos.pdf'])).toBe(question)
  })

  // The guard's boundary: ONE content-bearing survivor is enough to keep the
  // strip — "resumime <title>" must still shed the title echo (the module's
  // founding replay case) and search "resumime".
  it('still strips when at least one content-bearing token survives', () => {
    expect(stripAttachmentEcho('resumime Sistemas de Informacion Gerencial 12va edicion', [BOOK])).toBe('resumime')
  })

  it('returns the query unchanged when there are no filenames', () => {
    expect(stripAttachmentEcho('cualquier cosa', [])).toBe('cualquier cosa')
  })

  it('returns an empty or whitespace-only query unchanged', () => {
    expect(stripAttachmentEcho('', [BOOK])).toBe('')
    expect(stripAttachmentEcho('   ', [BOOK])).toBe('   ')
  })

  it('unions echo sets across multiple filenames', () => {
    const query = 'compara redes con sistemas'

    expect(stripAttachmentEcho(query, ['Redes de Computadoras.pdf', BOOK])).toBe('compara con')
  })

  it('preserves the original order of surviving tokens', () => {
    expect(stripAttachmentEcho('primero sistemas segundo gerencial tercero', [BOOK])).toBe('primero segundo tercero')
  })
})
