// Execution limits for the ask-my-materials prompt-execution spawn (design
// D3, spec "Execution Limits" / "Oversized-PDF Pre-Spawn Rejection"). A NEW
// set of constants, deliberately NOT reusing `CLI_PROBE_TIMEOUT_MS` — that
// budgets a CLI booting to print a version or a help page
// (`cli/probeLimits.ts`), whereas these budget a model actually answering a
// question, which is a different order of magnitude. The shipped probe also
// has no output cap today.

/** Hard timeout for prompt execution — the process is killed if exceeded. */
export const ASK_TIMEOUT_MS = 300_000

/** Stdout cap — exceeding this kills the process and reports `OUTPUT_TOO_LARGE`. */
export const ASK_MAX_STDOUT_BYTES = 1_048_576

/** Pre-spawn per-attachment size gate — checked against the persisted `sizeBytes`, never a model self-report. */
export const ASK_MAX_FILE_BYTES = 33_554_432

/** Matches `askQuestionInputSchema`'s ceiling — kept in sync deliberately. */
export const ASK_MAX_QUESTION_LENGTH = 4_000

/** Cap on the stderr detail line captured for a non-zero-exit error message. */
export const ASK_MAX_STDERR_DETAIL_BYTES = 8 * 1024

/**
 * Derived-title truncation for a conversation (design D2/D4, spec "Derived
 * Titles"): a conversation's title is the first question's text, cut to
 * this length, computed once at creation — no rename affordance exists.
 */
export const ASK_TITLE_MAX_CHARS = 80

/**
 * Character budget for the prior-turns transcript window sent into each
 * fresh CLI spawn's prompt (design D2, spec "Size-Bounded Transcript
 * Window"). Chars stand in for tokens — no tokenizer dependency (#83's
 * frozen-stack constraint) — at roughly 4 chars/token, this plateaus
 * per-turn cost at app context + manifest + this budget + the question,
 * holding roughly 4-10 typical turns. Design-owned and tunable post-usage.
 */
export const ASK_TRANSCRIPT_BUDGET_CHARS = 24_000

/**
 * Character budget for injected retrieved-chunk text in the ask prompt
 * (attachment-fts-index spec "Retrieval budget" — pinned, not tunable: "MUST
 * NOT exceed 7000 characters total"). Mirrors `ASK_TRANSCRIPT_BUDGET_CHARS`'s
 * chars-stand-in-for-tokens rationale; `retrievalWindow.ts` drops whole
 * lowest-ranked chunks rather than truncating mid-chunk to stay under it.
 */
export const ASK_RETRIEVAL_BUDGET_CHARS = 7_000

/**
 * Character cap on the prior-turn context appended to the BM25 retrieval
 * query for a follow-up question (`retrievalQuery.ts`). Unlike the prompt
 * windows above, this one MAY cut mid-content: the enriched query is never
 * shown to the model or the student — it only seeds OR-joined match terms,
 * so a truncated tail loses nothing but candidate keywords.
 */
export const ASK_RETRIEVAL_QUERY_CONTEXT_CHARS = 2_000

/**
 * Max chunks requested per question from `AskAttachmentIndexPort.search()`
 * (attachment-fts-index spec "Scoped BM25 top-K retrieval" — pinned `TOP_K
 * = 6`). Bounds the BM25 query itself, upstream of the char-budget trim
 * above — the two limits compose (search cannot return more than this many
 * chunks; the budget trim can still drop some of those).
 */
export const ASK_RETRIEVAL_TOP_K = 6

/**
 * Candidate pool fetched from FTS before the diversity re-rank
 * (`retrievalDiversity.ts`). The BM25 top-`TOP_K` alone can fill with
 * near-copies of ONE passage — adjacent overlapping chunk windows rank
 * together — so the store is asked for a wider slate and the final
 * `TOP_K` are selected from it. A NEW value chosen in this change, not
 * pinned by any spec: 8× the window is enough slate for pass 1 to skip
 * whole runs of adjacent chunks and still fill six diverse slots, while
 * staying a trivial LIMIT for SQLite. The prompt never sees more than
 * `ASK_RETRIEVAL_TOP_K` chunks of it.
 */
export const ASK_RETRIEVAL_CANDIDATES = 48

/**
 * Same-attachment chunks whose `chunk_index` positions sit closer than this
 * are treated as near-duplicates of one passage by `retrievalDiversity.ts`.
 * A NEW value chosen in this change, not pinned by any spec: chunks are
 * fixed 1000-char windows with 120-char overlap, so index neighbors at
 * delta 1-2 share text directly or straddle the same page; delta 3 (~2600
 * fresh chars away) is the first distance that reads as a different
 * passage.
 */
export const ASK_RETRIEVAL_DIVERSITY_MIN_GAP = 3

/**
 * Content-size cap for a generated artifact block's body (cli-generated-
 * artifacts design D9, pinned — not tunable). Measured with
 * `Buffer.byteLength(body, 'utf8')`, never `.length`: bytes are the honest
 * unit for disk writes and the `ASK_MAX_STDOUT_BYTES` ceiling above. An
 * oversize artifact is dropped WHOLE — same `computeRetrievalWindow`
 * philosophy of never truncating mid-content.
 */
export const ASK_ARTIFACT_MAX_CONTENT_BYTES = 262_144
