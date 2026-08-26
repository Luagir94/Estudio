import { describe, expect, it } from 'vitest'
import { CLASS_NOTE_PREVIEW_MAX_CHARS, classNoteFileName, classNotePreview } from './classNoteDocument'

describe('classNoteFileName', () => {
  it('names the file after the class it belongs to', () => {
    expect(classNoteFileName('2026-08-24')).toBe('apunte-2026-08-24.md')
  })

  /*
   * `.md` is not decoration: `updateAttachmentText` refuses to save anything
   * whose name is not markdown, so an apunte named otherwise would be
   * writable once and never editable again.
   */
  it('always ends in .md', () => {
    expect(classNoteFileName('2026-01-01')).toMatch(/\.md$/)
  })
})

describe('classNotePreview', () => {
  /*
   * The APUNTES list shows one line per apunte. It rides on the `title`
   * column instead of being read from each file, because rendering a list of
   * N apuntes must not cost N disk reads on every subject-detail fetch.
   */
  it('is the first line of the apunte', () => {
    expect(classNotePreview('Capa de aplicación\n\nY después protocolos')).toBe('Capa de aplicación')
  })

  it('skips leading blank lines rather than previewing nothing', () => {
    expect(classNotePreview('\n\n  \nArranca acá')).toBe('Arranca acá')
  })

  /*
   * Markdown's own syntax is noise in a one-line preview: `# Título` should
   * read as "Título", not as a stray hash. Only the LEADING block marker is
   * stripped — inline emphasis inside the line is left alone, because
   * removing it would misrepresent what the line says.
   */
  it.each([
    ['# Título', 'Título'],
    ['### Sub', 'Sub'],
    ['- un item', 'un item'],
    ['* otro', 'otro'],
    ['> citado', 'citado'],
    ['1. primero', 'primero']
  ])('strips the leading block marker of %s', (source, expected) => {
    expect(classNotePreview(source)).toBe(expected)
  })

  it('leaves inline emphasis alone', () => {
    expect(classNotePreview('lo **importante** de hoy')).toBe('lo **importante** de hoy')
  })

  it('caps a runaway first line so one apunte cannot bloat every list row', () => {
    const preview = classNotePreview('x'.repeat(CLASS_NOTE_PREVIEW_MAX_CHARS + 50))
    expect(preview).toHaveLength(CLASS_NOTE_PREVIEW_MAX_CHARS)
  })

  /*
   * An apunte with no text is not a blank preview, it is NO apunte — the
   * save path deletes it instead of storing an empty document, the same rule
   * `class_notes` carried.
   */
  it.each(['', '   ', '\n\n', '#', '- '])('is null for %j, which is not an apunte at all', (source) => {
    expect(classNotePreview(source)).toBeNull()
  })
})
