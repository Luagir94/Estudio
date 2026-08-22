import { describe, expect, it } from 'vitest'
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

  it('drops a structurally malformed extraction with its carried reason', () => {
    const extraction: ArtifactExtraction = { kind: 'invalid', reason: 'malformed-block' }

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'malformed-block' })
  })

  it('drops with invalid-header when the header line is not valid JSON', () => {
    const extraction: ArtifactExtraction = { kind: 'block', headerLine: '{not valid json', body: 'contenido' }

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'invalid-header' })
  })

  it('drops with invalid-header when the header JSON does not match the required shape', () => {
    const extraction: ArtifactExtraction = {
      kind: 'block',
      headerLine: JSON.stringify({ materia: 'Física' }), // missing fileName
      body: 'contenido'
    }

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'invalid-header' })
  })

  // sanitizeFileName never returns a literal empty string — an all-dots name
  // like "..." collapses to "" internally and the reused sanitizer falls back
  // to a bare extension-less name, which then fails the extension whitelist
  // below. Same drop reason either way: the sanitizer is reused, never
  // reimplemented.
  it('drops with invalid-filename when the file name sanitizes to an extension-less fallback', () => {
    const extraction = block('Física', '...', 'contenido')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'invalid-filename' })
  })

  it('drops with invalid-filename when the sanitized extension is not .md or .txt', () => {
    const extraction = block('Física', 'resumen.pdf', 'contenido')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'invalid-filename' })
  })

  it('drops with empty-content when the body is empty', () => {
    const extraction = block('Física', 'resumen.md', '')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'empty-content' })
  })

  it('drops with empty-content when the body is whitespace-only', () => {
    const extraction = block('Física', 'resumen.md', '   \n  \n')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'empty-content' })
  })

  it('passes at exactly the 262144-byte content cap', () => {
    const extraction = block('Física', 'resumen.md', 'a'.repeat(262_144))

    const result = validateArtifact(extraction, subjects)

    expect(result.kind).toBe('valid')
  })

  it('drops with oversize one byte past the 262144-byte content cap', () => {
    const extraction = block('Física', 'resumen.md', 'a'.repeat(262_145))

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'oversize' })
  })

  // The cap is byte-based, not code-unit-based: a multibyte UTF-8 character
  // straddling the boundary must still be measured correctly.
  it('passes when a multibyte character keeps the body at exactly the byte cap', () => {
    const body = 'a'.repeat(262_140) + '🎉' // 4-byte emoji => 262_144 bytes total
    const extraction = block('Física', 'resumen.md', body)

    expect(Buffer.byteLength(body, 'utf8')).toBe(262_144)
    expect(validateArtifact(extraction, subjects).kind).toBe('valid')
  })

  it('drops with oversize when a multibyte character pushes the body one byte past the cap', () => {
    const body = 'a'.repeat(262_141) + '🎉' // 4-byte emoji => 262_145 bytes total
    const extraction = block('Física', 'resumen.md', body)

    expect(Buffer.byteLength(body, 'utf8')).toBe(262_145)
    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'oversize' })
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

  it('drops with unknown-subject when no subject matches, without auto-creating one', () => {
    const extraction = block('Química', 'resumen.md', 'contenido')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'unknown-subject' })
  })

  // No case folding: a case-differing near-miss is treated as unknown, never
  // resolved by a case-insensitive match.
  it('drops with unknown-subject on a case-differing near-miss (no folding)', () => {
    const extraction = block('física', 'resumen.md', 'contenido')

    expect(validateArtifact(extraction, subjects)).toEqual({ kind: 'dropped', reason: 'unknown-subject' })
  })

  it('drops with ambiguous-subject when more than one subject matches exactly', () => {
    const duplicateSubjects: ArtifactGateSubject[] = [
      { id: 1, name: 'Física' },
      { id: 2, name: 'Física' }
    ]
    const extraction = block('Física', 'resumen.md', 'contenido')

    expect(validateArtifact(extraction, duplicateSubjects)).toEqual({ kind: 'dropped', reason: 'ambiguous-subject' })
  })
})
