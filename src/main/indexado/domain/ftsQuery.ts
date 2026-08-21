// Pure question → FTS5 MATCH string builder (attachment-fts-index design
// "MATCH construction"). Splits on non-alphanumeric characters (`\p{L}`/
// `\p{N}` keeps Spanish accented letters and ñ inside a token instead of
// splitting on them), drops empty tokens, then double-quotes every token
// and OR-joins them.
//
// OR instead of implicit AND: a natural-language question is too strict
// under AND (any one missing word yields zero matches). Double-quoting
// every token is also what makes this injection-safe — a question
// containing a literal `AND`/`OR`/`NOT`/`NEAR` becomes a quoted phrase
// token, never an FTS5 query operator.
const TOKEN_SPLIT_PATTERN = /[^\p{L}\p{N}]+/u

export function buildMatchQuery(question: string): string | null {
  const tokens = question.split(TOKEN_SPLIT_PATTERN).filter((token) => token.length > 0)

  if (tokens.length === 0) {
    return null
  }

  return tokens.map((token) => `"${token}"`).join(' OR ')
}
