import { describe, expect, it } from 'vitest'
import {
  ASK_MAX_FILE_BYTES,
  ASK_MAX_QUESTION_LENGTH,
  ASK_MAX_STDERR_DETAIL_BYTES,
  ASK_MAX_STDOUT_BYTES,
  ASK_RETRIEVAL_BUDGET_CHARS,
  ASK_RETRIEVAL_TOP_K,
  ASK_TIMEOUT_MS,
  ASK_TRANSCRIPT_BUDGET_CHARS
} from './limits'

// Exact constants pinned by design D3 — a NEW set of limits, deliberately
// NOT reusing the probe's 5000ms timeout (that is `--version`-specific
// tuning; spec "Execution Limits" / "Oversized-PDF Pre-Spawn Rejection").
describe('ask domain limits', () => {
  it('ASK_TIMEOUT_MS is exactly 5 minutes, expressed in milliseconds', () => {
    expect(ASK_TIMEOUT_MS).toBe(300_000)
  })

  it('ASK_MAX_STDOUT_BYTES is exactly 1MB, expressed in bytes', () => {
    expect(ASK_MAX_STDOUT_BYTES).toBe(1_048_576)
  })

  it('ASK_MAX_FILE_BYTES is exactly 32MB, expressed in bytes', () => {
    expect(ASK_MAX_FILE_BYTES).toBe(33_554_432)
  })

  it('ASK_MAX_QUESTION_LENGTH matches the shared schema ceiling of 4000', () => {
    expect(ASK_MAX_QUESTION_LENGTH).toBe(4_000)
  })

  it('ASK_MAX_STDERR_DETAIL_BYTES is exactly 8KB, expressed in bytes', () => {
    expect(ASK_MAX_STDERR_DETAIL_BYTES).toBe(8 * 1024)
  })

  it('ASK_TRANSCRIPT_BUDGET_CHARS is exactly 24000 (design D2 budget)', () => {
    expect(ASK_TRANSCRIPT_BUDGET_CHARS).toBe(24_000)
  })

  it('ASK_RETRIEVAL_BUDGET_CHARS is exactly 7000 (attachment-fts-index spec: pinned "Retrieval budget")', () => {
    expect(ASK_RETRIEVAL_BUDGET_CHARS).toBe(7_000)
  })

  it('ASK_RETRIEVAL_TOP_K is exactly 6 (attachment-fts-index spec: pinned "Scoped BM25 top-K retrieval")', () => {
    expect(ASK_RETRIEVAL_TOP_K).toBe(6)
  })
})
