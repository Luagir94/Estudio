import { describe, expect, it } from 'vitest'
import type { AskArtifactDropReason } from '../../../shared/ipc/ask'
import type { ArtifactExtraction } from './artifactBlock'
import { validateArtifact, type ArtifactGateSubject } from './artifactGate'

// THE validation gate (design "Validation Gate", spec "Validation gate
// enforces shape, filename, size, and a single block structurally" /
// "Subject resolution by exact name match only"). Pure function: header
// shape -> filename (reused sanitizer) -> extension whitelist -> body ->
// byte cap -> exact subject resolution -> valid.
describe('validateArtifact', () => {
  const subjects: ArtifactGateSubject[] = [{ id: 1, name: 'Física' }]

  const block = (materia: string, fileName: string, body: string): ArtifactExtraction => ({
    kind: 'block',
    headerLine: JSON.stringify({ materia, fileName }),
    body
  })

  it('passes through {kind: "none"} unchanged when there is no artifact block', () => {
    const extraction: ArtifactExtraction = { kind: 'none' }

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'none' })
  })

  const dropCases: [string, ArtifactExtraction, AskArtifactDropReason][] = [
    [
      'a structurally malformed extraction carries its reason through',
      { kind: 'invalid', reason: 'malformed-block' },
      'malformed-block'
    ],
    [
      'header line is not valid JSON',
      { kind: 'block', headerLine: '{not valid json', body: 'contenido' },
      'invalid-header'
    ],
    [
      'header JSON is missing fileName',
      { kind: 'block', headerLine: JSON.stringify({ materia: 'Física' }), body: 'contenido' },
      'invalid-header'
    ],
    // sanitizeFileName never returns a literal empty string — an all-dots
    // name collapses to "" internally and falls back to a bare
    // extension-less name, which then fails the extension whitelist below.
    // Same drop reason either way: the sanitizer is reused, never reimplemented.
    ['file name sanitizes to an extension-less fallback', block('Física', '...', 'contenido'), 'invalid-filename'],
    ['sanitized extension is not .md or .txt', block('Física', 'resumen.pdf', 'contenido'), 'invalid-filename'],
    ['body is empty', block('Física', 'resumen.md', ''), 'empty-content'],
    ['body is whitespace-only', block('Física', 'resumen.md', '   \n  \n'), 'empty-content'],
    ['body is one byte past the 262144-byte cap', block('Física', 'resumen.md', 'a'.repeat(262_145)), 'oversize'],
    // The cap is byte-based, not code-unit-based.
    [
      'a multibyte character pushes the body one byte past the cap',
      block('Física', 'resumen.md', 'a'.repeat(262_141) + '🎉'), // 4-byte emoji => 262_145 bytes total
      'oversize'
    ],
    ['no subject matches, and none is auto-created', block('Química', 'resumen.md', 'contenido'), 'unknown-subject'],
    // No case folding.
    ['a case-differing near-miss (no folding)', block('física', 'resumen.md', 'contenido'), 'unknown-subject']
  ]

  it.each(dropCases)('drops with %s -> %s', (_label, extraction, reason) => {
    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason })
  })

  it('drops with ambiguous-subject when more than one subject matches exactly', () => {
    const duplicateSubjects: ArtifactGateSubject[] = [
      { id: 1, name: 'Física' },
      { id: 2, name: 'Física' }
    ]
    const extraction = block('Física', 'resumen.md', 'contenido')

    expect(validateArtifact(extraction, duplicateSubjects)).toEqual({ kind: 'dropped', reason: 'ambiguous-subject' })
  })

  it('passes at exactly the 262144-byte content cap, including a multibyte character straddling it', () => {
    const asciiExtraction = block('Física', 'resumen.md', 'a'.repeat(262_144))
    const multibyteBody = 'a'.repeat(262_140) + '🎉' // 4-byte emoji => 262_144 bytes total
    const multibyteExtraction = block('Física', 'resumen.md', multibyteBody)

    expect(Buffer.byteLength(multibyteBody, 'utf8')).toBe(262_144)
    expect(validateArtifact(asciiExtraction, subjects).kind).toBe('valid')
    expect(validateArtifact(multibyteExtraction, subjects).kind).toBe('valid')
  })

  it('resolves the subject and returns the sanitized name, content, and trimmed exact match', () => {
    const extraction = block('  Física  ', 'resumen.md', 'contenido real')

    expect(validateArtifact(extraction, subjects)).toEqual({
      kind: 'valid',
      subjectId: 1,
      subjectName: 'Física',
      fileName: 'resumen.md',
      content: 'contenido real'
    })
  })
})
