// Structural split (design D1/D2, spec "Artifact block emission convention" /
// "Explicit discriminated-union artifact outcome report"). Separates the
// trailing sentinel-wrapped artifact block from the model's inner text
// BEFORE any JSON parsing happens (runs ahead of `stripFence`/`JSON.parse` in
// `parseAskResponse`, Unit 5) — so a broken block can never turn the whole
// response into `MALFORMED_RESPONSE`.
//
// This module is PURELY structural: it finds sentinel lines and slices text.
// It does NOT validate header shape, filename, size, or subject — that is
// `artifactGate.ts` (Unit 4). A malformed block here still lets the model's
// answer parse and render (spec "answer always survives a broken block").

export const ARTIFACT_START_SENTINEL = '--- ARTEFACTO GENERADO ---'
export const ARTIFACT_END_SENTINEL = '--- FIN DEL ARTEFACTO GENERADO ---'

/** Pre-gate extraction result: no block, a structurally-sound block, or a structurally-broken one. */
export type ArtifactExtraction =
  | { kind: 'none' }
  | { kind: 'block'; headerLine: string; body: string }
  | { kind: 'invalid'; reason: 'malformed-block' }

const MALFORMED: ArtifactExtraction = { kind: 'invalid', reason: 'malformed-block' }

/**
 * Splits `innerText` into the text that belongs to the result JSON
 * (`resultText`) and whatever sentinel-wrapped artifact block follows it
 * (`block`).
 *
 * No start sentinel → `resultText` is `innerText`, byte-identical (legacy
 * path, spec "Legacy responses parse identically"). A second start sentinel
 * ANYWHERE after the first — even past a well-formed first block — makes the
 * WHOLE extraction malformed; it is never split into two candidates (spec
 * "A second start sentinel makes the whole extraction malformed").
 */
export function splitArtifactBlock(innerText: string): { resultText: string; block: ArtifactExtraction } {
  const lines = innerText.split(/\r\n|\r|\n/)
  const startIndex = lines.indexOf(ARTIFACT_START_SENTINEL)

  if (startIndex === -1) {
    return { resultText: innerText, block: { kind: 'none' } }
  }

  const resultText = lines.slice(0, startIndex).join('\n')

  const secondStartIndex = lines.indexOf(ARTIFACT_START_SENTINEL, startIndex + 1)
  if (secondStartIndex !== -1) {
    return { resultText, block: MALFORMED }
  }

  const endIndex = lines.indexOf(ARTIFACT_END_SENTINEL, startIndex + 1)
  if (endIndex === -1) {
    return { resultText, block: MALFORMED }
  }

  const hasTrailingJunk = lines.slice(endIndex + 1).some((line) => line.trim().length > 0)
  if (hasTrailingJunk) {
    return { resultText, block: MALFORMED }
  }

  return { resultText, block: extractBlock(lines.slice(startIndex + 1, endIndex)) }
}

/** Header = first non-empty line inside the block; body = every line strictly after it, joined verbatim. */
function extractBlock(blockLines: readonly string[]): ArtifactExtraction {
  const headerIndex = blockLines.findIndex((line) => line.trim().length > 0)
  const headerLine = blockLines[headerIndex]
  if (headerLine === undefined) {
    // findIndex returned -1: the block has no non-empty line.
    return { kind: 'block', headerLine: '', body: '' }
  }

  return {
    kind: 'block',
    headerLine,
    body: blockLines.slice(headerIndex + 1).join('\n')
  }
}
