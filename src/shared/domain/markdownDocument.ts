// Pure, framework-free domain module: the two things that turn a name the
// student typed into a markdown ATTACHMENT — what its file is called, and
// what the document is born holding.
//
// Sibling of `main/adjuntos/domain/classNoteDocument.ts`, and the split
// between them is the whole point: an apunte is named by its CLASS (the date
// is its identity), while a free document of the materia has no identity but
// the one the student gave it. Same storage, same editor, different answer to
// "what is this called?".
//
// It lives in `shared/domain` rather than beside that sibling because BOTH
// processes need the naming rule: main writes the file under it, and the
// "Nuevo documento" dialog shows the student the file name they are about to
// get. One rule, one copy — a renderer that re-derived the slug would drift
// from the file actually written the first time either side changed.
//
// No electron, no better-sqlite3, no fs.

// Kept well under `sanitizeFileName`'s 100-char cap: the service prepends a
// uuid to the stored file name, and a stem at the full limit would push the
// stored name past it and get truncated there instead of here, where the
// rule is visible.
const MAX_STEM_LENGTH = 60
const FALLBACK_STEM = 'documento'

// Combining marks left behind by the NFD decomposition below — removing them
// turns `á` into `a` rather than dropping the letter altogether, which is
// what a plain `[^a-z0-9]` pass would do to half the Spanish alphabet.
const COMBINING_MARKS = /\p{M}/gu
const NON_SLUG_RUN = /[^a-z0-9]+/g
const EDGE_SEPARATORS = /^-+|-+$/g

/**
 * The stored file name for a document the student created by name.
 *
 * `.md` is load-bearing, not decoration: `updateAttachmentText` refuses to
 * save anything whose name is not markdown, so a document named otherwise
 * would be writable exactly once and never editable again — the same rule
 * `classNoteFileName` lives under.
 *
 * Collisions are NOT prevented here and do not need to be: the service
 * prefixes a uuid onto the stored name, so two documents called "Resumen"
 * are two files. What the list shows is the name the student typed.
 */
export function markdownDocumentFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_RUN, '-')
    .replace(EDGE_SEPARATORS, '')
    .slice(0, MAX_STEM_LENGTH)
    .replace(EDGE_SEPARATORS, '')

  return `${slug === '' ? FALLBACK_STEM : slug}.md`
}

/**
 * The text a brand-new document is born with.
 *
 * NOT empty, and that is deliberate: "Crear y escribir" opens the editor on
 * the document in the same breath that creates it, and an empty file gives
 * the student a blinking cursor with no place to write under. The heading is
 * the name they just typed — unslugified, accents and casing intact, because
 * the file name is a storage detail and the heading is the document.
 */
export function markdownDocumentSeed(name: string): string {
  return `# ${name}\n\n`
}
