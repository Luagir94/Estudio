// Pure, framework-free domain module: the two things that turn a class
// apunte into an ordinary markdown ATTACHMENT — what its file is called, and
// what one line of it looks like in a list.
//
// No electron, no better-sqlite3, no fs (enforced by tooling/
// dependencyGuard.mts's no-electron-or-sqlite-in-domain rule).

/**
 * The stored file name of the apunte for one class.
 *
 * The DATE is the identity, because the date is what an apunte is anchored
 * by — there is no stored "class session" row to name it after. Two apuntes
 * of the same subject can never collide, and the `(subject_id, class_date)`
 * unique index makes that a guarantee rather than a hope.
 *
 * `.md` is load-bearing, not decoration: `updateAttachmentText` refuses to
 * save anything whose name is not markdown, so an apunte named otherwise
 * would be writable exactly once and never editable again.
 */
export function classNoteFileName(classDate: string): string {
  return `apunte-${classDate}.md`
}

/**
 * How much of the first line the APUNTES list keeps. Long enough to be a
 * real sentence, short enough that one runaway apunte cannot stretch every
 * row of the list.
 */
export const CLASS_NOTE_PREVIEW_MAX_CHARS = 120

// Only the LEADING block marker of a line: heading hashes, a bullet, a quote
// caret, an ordered-list number. Inline emphasis is deliberately NOT in here
// — stripping `**` from the middle of a line would change what the line says,
// and the preview's job is to quote the apunte, not to rewrite it.
// The lookaheads keep this from eating text that merely STARTS with a
// marker character: `-5 grados` is a temperature, not a bullet, so the dash
// only counts when whitespace or the end of the line follows it. They also
// make a bare `#` strip to nothing, which is how a document holding only
// punctuation correctly previews as "no apunte at all".
const LEADING_BLOCK_MARKER = /^\s*(?:#{1,6}(?=\s|$)|[-*+](?=\s|$)|>|\d+[.)](?=\s|$))\s*/

/**
 * The apunte's first line of actual text, or `null` when it has none.
 *
 * `null` is not "an empty preview" — it is the answer to "is there an apunte
 * here at all", and the save path uses it that way: a document that previews
 * to null is DELETED rather than stored blank. That is the same rule the
 * `class_notes` table carried ("an emptied apunte is a deleted apunte"), and
 * it is what keeps "this class has an apunte" a question the row's mere
 * presence answers.
 */
export function classNotePreview(content: string): string | null {
  for (const line of content.split(/\r\n|\r|\n/)) {
    const text = line.replace(LEADING_BLOCK_MARKER, '').trim()
    if (text.length > 0) {
      return text.slice(0, CLASS_NOTE_PREVIEW_MAX_CHARS)
    }
  }
  return null
}
