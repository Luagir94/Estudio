// Pure filename-echo filter for the retrieval query. A question that echoes
// an attachment's title poisons BM25: title tokens are the RAREST in the
// corpus (they live in front matter, not in the chapters), and `ftsQuery.ts`
// OR-joins every token with equal weight — so "resumime Sistemas de
// Informacion Gerencial" ranked front-matter chunks over the mid-book content
// the student was asking about (replay: top-6 chunk_index {1, 2037, 54, 0, 2,
// 88}, 5/6 front matter; the same question minus the title echo retrieved all
// mid-book). Title tokens are identity, not topic — dropping them before the
// search is safe because the filenames already scope WHAT is searched.
//
// This filters the SEARCH QUERY only. The question line the model reads is
// composed by `promptBuilder.ts` from the raw question and never sees this
// string — the same invariant `retrievalQuery.ts` documents.

/**
 * Same Unicode split `ftsQuery.buildMatchQuery` uses: `\p{L}`/`\p{N}` keeps
 * Spanish accented letters and ñ inside a token instead of splitting on them.
 * Mirroring it matters — an echo test over DIFFERENT tokens than the ones the
 * MATCH query will mint could drop the wrong thing or miss the echo entirely.
 */
const TOKEN_SPLIT_PATTERN = /[^\p{L}\p{N}]+/u

/**
 * Below this folded length a token is never substring-compared. The floor
 * keeps stopwords like "de"/"el" from vanishing into longer filename tokens
 * while still catching the production-observed typo class: the user typed
 * "istemas", the chunker had minted "istemas" fragments at 1000-char cut
 * points (df=6), and that fake-rare token pulled front-matter-adjacent junk
 * into the top-6 — substring matching drops it against filename "sistemas".
 */
const SUBSTRING_MIN_LENGTH = 4

/**
 * Mirrors the FTS table's `tokenize='unicode61 remove_diacritics 2'`
 * (drizzle/migrations/0007_attachment_chunks_fts.sql): lowercase, decompose,
 * strip combining marks — so "Edición" ≡ "edicion" on both sides.
 */
function fold(token: string): string {
  return token.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function tokenize(text: string): string[] {
  return text.split(TOKEN_SPLIT_PATTERN).filter((token) => token.length > 0)
}

/**
 * Drops query tokens that echo any of `fileNames` — exact folded match (which
 * also takes extension tokens like "pdf"), or a mutual-substring match when
 * both folded tokens reach `SUBSTRING_MIN_LENGTH`. Survivors keep their
 * original order, space-joined — lossless downstream because
 * `ftsQuery.buildMatchQuery` re-tokenizes and OR-joins anyway.
 *
 * Two deliberate identity outcomes return the ORIGINAL string byte-identical:
 * no token echoed (punctuation and spacing must survive untouched), and no
 * CONTENT-BEARING survivor — a survivor whose folded length reaches
 * `SUBSTRING_MIN_LENGTH`. The content-bearing guard covers two cases at once:
 * every token echoed (a title-only question like "resumime Sistemas de
 * Informacion Gerencial" must still search something; front-matter results
 * are acceptable and intended), and a topic-named filename eating the
 * question's only content word ("grafos.pdf" + "¿Qué es un grafo?"). Files
 * are routinely named after their topic, so a filename token is not reliably
 * identity — and a stopword-only query is empirically WORSE than the echo it
 * avoids: its BM25 scores collapse to no discrimination and the top-K fills
 * with junk. Better the original echoing query than that.
 */
export function stripAttachmentEcho(query: string, fileNames: readonly string[]): string {
  if (fileNames.length === 0) {
    return query
  }

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) {
    return query
  }

  const nameTokens = fileNames.flatMap(tokenize).map(fold)

  const isEcho = (folded: string): boolean =>
    nameTokens.some(
      (name) =>
        name === folded ||
        (name.length >= SUBSTRING_MIN_LENGTH &&
          folded.length >= SUBSTRING_MIN_LENGTH &&
          (name.includes(folded) || folded.includes(name)))
    )

  const survivors = queryTokens.filter((token) => !isEcho(fold(token)))

  if (survivors.length === queryTokens.length) {
    return query
  }

  // Zero CONTENT-BEARING survivors (not zero survivors): stopword-length
  // leftovers like "Qué es un" must not ship as the whole query. This also
  // subsumes the all-echo case, where `survivors` is empty.
  const hasContentSurvivor = survivors.some((token) => fold(token).length >= SUBSTRING_MIN_LENGTH)
  if (!hasContentSurvivor) {
    return query
  }

  return survivors.join(' ')
}
