import { describe, expect, it } from 'vitest'
import { ARTIFACT_END_SENTINEL, ARTIFACT_START_SENTINEL, splitArtifactBlock } from './artifactBlock'

// Structural split (design D1/D2, spec "Artifact block emission convention" /
// "Explicit discriminated-union artifact outcome report"). Runs BEFORE
// `stripFence`/`JSON.parse` in `parseAskResponse` (Unit 5) — this module only
// separates the trailing sentinel-wrapped block from the model's inner text,
// it never validates header shape, filename, size, or subject (that is
// `artifactGate.ts`, Unit 4).
describe('splitArtifactBlock', () => {
  const resultJson = JSON.stringify({ kind: 'answer', answer: 'x', citations: [] })

  it('returns the input text byte-identical when no artifact block is present', () => {
    const result = splitArtifactBlock(resultJson)

    expect(result.resultText).toBe(resultJson)
    expect(result.block).toEqual({ kind: 'none' })
  })

  // Same well-formed shape, split on LF vs CRLF — the sentinel match must
  // recognize both line-ending styles identically.
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n']
  ])('splits a well-formed artifact block joined with %s line endings', (_label, joiner) => {
    const innerText = [
      resultJson,
      ARTIFACT_START_SENTINEL,
      '{"materia": "Física", "fileName": "resumen.md"}',
      'Primera línea del documento.',
      'Segunda línea del documento.',
      ARTIFACT_END_SENTINEL
    ].join(joiner)

    const result = splitArtifactBlock(innerText)

    expect(result.resultText).toBe(resultJson)
    expect(result.block).toEqual({
      kind: 'block',
      headerLine: '{"materia": "Física", "fileName": "resumen.md"}',
      body: 'Primera línea del documento.\nSegunda línea del documento.'
    })
  })

  // Every case below collapses the WHOLE extraction to a single
  // malformed-block outcome — never a partial or double-split result — while
  // `resultText` (everything before the first start sentinel) stays intact,
  // so the answer still parses.
  const malformedCases: [string, string[]][] = [
    ['the end sentinel is missing', [ARTIFACT_START_SENTINEL, '{"materia":"Física","fileName":"a.md"}', 'contenido']],
    [
      'non-whitespace text follows the end sentinel',
      [
        ARTIFACT_START_SENTINEL,
        '{"materia":"Física","fileName":"a.md"}',
        'contenido',
        ARTIFACT_END_SENTINEL,
        'texto sobrante'
      ]
    ],
    [
      'a second start sentinel appears anywhere later, never splitting into two candidates',
      [
        ARTIFACT_START_SENTINEL,
        '{"materia":"Física","fileName":"a.md"}',
        'contenido uno',
        ARTIFACT_END_SENTINEL,
        ARTIFACT_START_SENTINEL,
        '{"materia":"Química","fileName":"b.md"}',
        'contenido dos',
        ARTIFACT_END_SENTINEL
      ]
    ]
  ]

  it.each(malformedCases)('drops the whole extraction as malformed-block when %s', (_label, blockLines) => {
    const innerText = [resultJson, ...blockLines].join('\n')

    const result = splitArtifactBlock(innerText)

    expect(result.resultText).toBe(resultJson)
    expect(result.block).toEqual({ kind: 'invalid', reason: 'malformed-block' })
  })

  // Triangulation: whitespace-only trailing lines are NOT "non-whitespace
  // text" and must not be treated as trailing junk.
  it('tolerates whitespace-only trailing lines after the end sentinel', () => {
    const innerText = [
      resultJson,
      ARTIFACT_START_SENTINEL,
      '{"materia":"Física","fileName":"a.md"}',
      'contenido',
      ARTIFACT_END_SENTINEL,
      '   ',
      ''
    ].join('\n')

    const result = splitArtifactBlock(innerText)

    expect(result.block).toEqual({
      kind: 'block',
      headerLine: '{"materia":"Física","fileName":"a.md"}',
      body: 'contenido'
    })
  })

  it('does not falsely truncate on a body line that merely resembles a sentinel', () => {
    const innerText = [
      resultJson,
      ARTIFACT_START_SENTINEL,
      '{"materia":"Física","fileName":"a.md"}',
      '-- ARTEFACTO GENERADO (borrador) --',
      'contenido real',
      ARTIFACT_END_SENTINEL
    ].join('\n')

    const result = splitArtifactBlock(innerText)

    expect(result.block).toEqual({
      kind: 'block',
      headerLine: '{"materia":"Física","fileName":"a.md"}',
      body: '-- ARTEFACTO GENERADO (borrador) --\ncontenido real'
    })
  })

  // Split MUST precede stripFence (design D2): a fenced result JSON followed
  // by a block would otherwise fail the whole-text fence regex.
  it('splits the sentinel block correctly even when the result JSON is wrapped in a code fence', () => {
    const fenced = ['```json', JSON.stringify({ kind: 'not-found' }), '```'].join('\n')
    const innerText = [
      fenced,
      ARTIFACT_START_SENTINEL,
      '{"materia":"Física","fileName":"a.md"}',
      'contenido',
      ARTIFACT_END_SENTINEL
    ].join('\n')

    const result = splitArtifactBlock(innerText)

    expect(result.resultText).toBe(fenced)
    expect(result.block).toEqual({
      kind: 'block',
      headerLine: '{"materia":"Física","fileName":"a.md"}',
      body: 'contenido'
    })
  })
})
