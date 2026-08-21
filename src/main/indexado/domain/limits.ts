// Pinned constants for attachment indexing (attachment-fts-index spec
// "Chunking" / "Format dispatch and size cap", design "Storage" /
// "Technical Approach"). Exact values, not tunable ranges — the spec fixes
// them precisely so chunk boundaries and the oversized-spreadsheet skip are
// deterministic and testable.

/** Every chunk is exactly this many characters, except the final one (spec: "Chunking"). */
export const CHUNK_SIZE_CHARS = 1000

/** Consecutive chunks share exactly this many trailing/leading characters (spec: "Chunking"). */
export const CHUNK_OVERLAP_CHARS = 120

/**
 * XLSX/CSV source files at or above this size become `not-indexable`
 * WITHOUT parsing (spec "Format dispatch and size cap": "10 MiB
 * (10,485,760 bytes)"). Consumed by the spreadsheet extractor in a later
 * slice — declared here now because it is one of the three pinned limits
 * this slice's design assigns to `limits.ts`.
 */
export const MAX_SPREADSHEET_SOURCE_BYTES = 10 * 1024 * 1024
