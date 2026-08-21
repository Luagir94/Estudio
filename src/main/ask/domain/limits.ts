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
