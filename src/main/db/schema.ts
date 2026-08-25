// Domain schema (design §3). Slice 2a adds `subjects` and `schedule_slots`;
// slice 2b adds the `deadlines` TABLE (needed here for cascade-delete and
// subject-detail aggregation — see gate-findings/slice-2a and tasks 3.5/
// 3.11); the deadline domain/lifecycle (entregas:* commands) still ships in
// slice 4.
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// A Program is a carrera ("Abogacía") or a standalone course ("Curso de
// Bartender"). `institution` is PLAIN TEXT, not a table: the calendar
// belongs to the program, not to the institution (one university can run
// Abogacía on cuatrimestres and a diplomatura on its own dates), so a
// separate institutions table would buy a JOIN and nothing else.
export const programs = sqliteTable('programs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  institution: text('institution'),
  color: text('color').notNull(),
  // 'numerico' | 'binario', fixed at creation — it decides whether the
  // program has an average at all and whether its subjects may carry a grade
  // (see renderer/carreras/domain/program.ts).
  gradingScheme: text('grading_scheme').notNull(),
  // Top of the scale (10, 100, …), NULL under 'binario'. Stored because
  // 1-10 is an Argentine convention, not a universal one — the same reason
  // period dates are data instead of being derived from the period's kind.
  gradeScale: integer('grade_scale')
})

// A Period is a named interval with EXPLICIT dates (see
// renderer/carreras/domain/period.ts for the full rationale):
//
// - `kind` ("cuatrimestre", "curso", "anual", …) is a label. It is free text
//   rather than an enum because the institution names its own periods, and
//   it never derives a date — the dates are user-entered data.
// - There is no `year` column. The academic year is derived from `startsOn`,
//   because a course running Nov 2026 → Mar 2027 belongs to no single
//   calendar year and a stored year would be a second source of truth.
// - There is no `parent_id`. Nesting (a bimestre inside a cuatrimestre) has
//   no use case yet, and periods are ALLOWED TO OVERLAP — that is how an
//   annual subject gets its own "Anual 2026" period alongside the two
//   cuatrimestres, which is what removes the need for a subject↔period
//   join table.
export const periods = sqliteTable('periods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  // Calendar dates, ISO `YYYY-MM-DD`, no time and no offset — a period
  // boundary is a whole day (unlike `deadlines.due_at`, which needs a
  // moment).
  startsOn: text('starts_on').notNull(),
  // NULLABLE: an open-ended period, e.g. "clases de inglés" that simply keep
  // going. NULL is stored rather than a far-future sentinel date so nothing
  // downstream can mistake it for a real end (design node `KIjPX`).
  endsOn: text('ends_on')
})

// An administrative date owned by the PROGRAM, not by a subject: the
// exam-enrolment window, the course-enrolment window, the day a regularidad
// expires, or any other trámite. It hangs off `programs` for the same reason
// `periods` does — the institution's calendar belongs to the carrera, and a
// trámite without one is not representable.
//
// There is deliberately NO `done` column. A trámite has no manual
// completion: it is upcoming or past BY THE CALENDAR, and a "done" flag
// would be a second, hand-maintained truth about a question the dates
// already answer (contrast `deadlines.done`, which records a decision only
// the student can make). Past dates simply stop surfacing in Hoy/Entregas.
export const academicDates = sqliteTable('academic_dates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  // Closed set 'inscripcionFinales' | 'inscripcionCursadas' |
  // 'vencimientoRegularidad' | 'otro', ZOD-OWNED (shared/ipc/fechas.ts) —
  // plain text with no CHECK constraint and no enum table, the same policy
  // every other closed set in this schema follows (`subjects.outcome`,
  // `deadlines.type`, `finalExams.result`, `attachments.indexStatus`).
  // The kind is a LABEL: it classifies the row for the reader and never
  // derives a date or changes how the date behaves.
  kind: text('kind').notNull(),
  // Calendar dates, ISO `YYYY-MM-DD`, no time and no offset — same contract
  // as `periods.starts_on`: a trámite boundary is a whole day.
  startsOn: text('starts_on').notNull(),
  // NULLABLE: null means the date is a SINGLE DAY, not a window. Stored as
  // null rather than a copy of `startsOn` so "el 20 de diciembre" and "del 20
  // al 20 de diciembre" stay distinguishable, and so nothing downstream has
  // to guess which of the two a duplicated date meant.
  endsOn: text('ends_on')
})

// Subject is the aggregate root (design §2, §4: "no standalone
// slot-creation command may exist"). notas is ONE plain-text column — no
// markdown, no rich formatting, no search index (spec: "notas Field Cap").
// A subject MAY separately own zero or more `attachments` rows (spec
// "materia-attachments"); that table exists independently below and does
// not change notas' plain-text semantics.
export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  color: text('color').notNull(),
  docente: text('docente'),
  contacto: text('contacto'),
  // Ficha de cátedra (comisión/aula): plain optional text, same contract as
  // docente/contacto — the trim/cap rules live in Zod
  // (shared/ipc/materias.ts), never in SQL CHECKs.
  comision: text('comision'),
  aula: text('aula'),
  campusUrl: text('campus_url'),
  // Link to the class chat group (WhatsApp/Discord/Telegram invite). Same
  // contract as campusUrl: stored as-is, the https-only allowlist is
  // enforced at OPEN time in main (app/campusUrlValidator.ts), not here —
  // the display label is derived in the renderer domain
  // (renderer/materias/domain/groupLink.ts).
  groupUrl: text('group_url'),
  notas: text('notas'),
  attendanceMinPercent: integer('attendance_min_percent'),
  // Nullable: subjects created before periods existed have none, and
  // deleting a period must not destroy the subjects that lived in it — they
  // fall back to unassigned (`set null`) rather than cascading away.
  periodId: integer('period_id').references(() => periods.id, { onDelete: 'set null' }),
  // The student's own decision: 'aprobada' | 'reprobada' | 'finalPendiente'.
  // NULL means "not decided yet", which is exactly what makes a subject read
  // as `sinCerrar` once its period ends instead of quietly disappearing
  // (see renderer/materias/domain/subjectStatus.ts). Stored as text, not an
  // enum table — the set is closed and owned by the domain module.
  outcome: text('outcome'),
  // Only meaningful when the owning program grades 'numerico'; always NULL
  // under 'binario' (enforced by program.ts's validateGrade). `real` because
  // a 7.5 is a real nota, not a rounding artefact. NULL means "not graded
  // yet" and is never treated as a zero when averaging.
  grade: real('grade'),
  // The condición de cursada the CÁTEDRA granted: 'regular' | 'promocionada'
  // | 'libre', ZOD-OWNED (shared/ipc/materias.ts) — plain text, no CHECK and
  // no enum table, the same policy every other closed set here follows.
  //
  // STORED, NEVER DERIVED. This column exists precisely because the app
  // cannot compute it: every cátedra writes its own rules (promoción con 7,
  // con 8, con asistencia, sin ella; regularidad con un parcial aprobado, con
  // los dos, con recuperatorio rendido). Deriving it from `partial_exams`
  // rows or from `attendance_min_percent` would be the app inventing a
  // regulation and then quietly contradicting the acta. What the student
  // records here is the faculty's verdict; the app only reports it.
  //
  // NULL means "not declared yet" — the honest state for a cursada in
  // progress — and reads as the ABSENCE of a badge, never as a "sin definir"
  // chip: an undeclared condición is not a condición.
  regularity: text('regularity')
})

// One parcial or recuperatorio of a cursada ("1er parcial", "Recuperatorio
// 1"). Owned by the subject and cascade-deleted with it, same rule as
// schedule_slots, deadlines and final_exams.
//
// `takenOn` is NULLABLE BY DESIGN, for the same reason `final_exams.taken_on`
// is: a parcial can be recorded before the cátedra publishes its date, and a
// far-future sentinel would be indistinguishable from a real one.
//
// This table deliberately DERIVES NOTHING. It does not decide the subject's
// `regularity` (see that column's comment), and it does not decide the
// subject's `outcome` either — recording a result is the whole action, and
// what the results MEAN is the cátedra's rule, not this schema's.
export const partialExams = sqliteTable('partial_exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  takenOn: text('taken_on'),
  // Closed set 'pendiente' | 'aprobado' | 'reprobado', zod-owned
  // (shared/ipc/materias.ts) — same no-SQL-constraint precedent as
  // `finalExams.result`.
  result: text('result').notNull().default('pendiente'),
  // The nota the cátedra put on this parcial under a 'numerico' program.
  // Unlike `finalExams.grade` this is NOT approved-only: a reprobado 3 is
  // exactly the number on the acta, and hiding it would lose real data. NULL
  // is "aprobado sin nota", a first-class state and the only one under
  // 'binario'. The scheme/range rule is the shared cross-entity one
  // (shared/domain/grading.ts), enforced in sqlitePartialExamRepository on
  // both create and update; no CHECK constraint, same policy as
  // `subjects.grade` and `finalExams.grade`.
  grade: real('grade')
})

// One sitting of a final exam ("1ra mesa — Turno agosto"). Owned by the
// subject and cascade-deleted with it, same rule as schedule_slots and
// deadlines.
//
// `takenOn` is NULLABLE BY DESIGN: you can record a mesa before the
// institution publishes its calendar (design node `YWq6n` — the column is
// literally headed "FECHA (OPCIONAL)").
//
// The subject's resulting state is NOT stored here or on the subject — it is
// derived from these rows (one `aprobado` wins; all `reprobado` fails;
// anything still `pendiente` keeps the subject in standby), which is what
// lets adding a new mesa move the subject out of `reprobada` without any
// state to undo.
export const finalExams = sqliteTable('final_exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  takenOn: text('taken_on'),
  result: text('result').notNull().default('pendiente'),
  // The nota of an APPROVED sitting under a 'numerico' program — the nota of
  // a subject passed via final lives here, not on the subject row (whose
  // `grade` is written only by materias:setOutcome). NULL is "aprobada sin
  // nota", a first-class state, and the only state under 'binario'. The write
  // rule — approved-only, program-validated, cleared on leaving 'aprobado' —
  // is enforced in sqliteFinalExamRepository.update; no CHECK constraint,
  // same policy as `subjects.grade`.
  grade: real('grade')
})

// No independent lifecycle: rows here are only ever written as part of a
// `materias:create`/`materias:updateSchedule` transaction (design §2).
// FK cascades so a subject delete removes its slots (design §3, amendment 6
// applies the same rule to deadlines in slice 4).
export const scheduleSlots = sqliteTable('schedule_slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  // Matches JS `Date.getDay()`: 0=Sunday..6=Saturday (see
  // shared/components/SlotEditor.tsx). The weekly-schedule projection
  // (slice 3) can compose occurrences directly with date-fns, no
  // translation table needed.
  dayOfWeek: integer('day_of_week').notNull(),
  startMinutes: integer('start_minutes').notNull(),
  endMinutes: integer('end_minutes').notNull(),
  location: text('location')
})

// Deadline lifecycle (full CRUD) ships in slice 4 (design amendment 7). The
// TABLE ships now because slice 2b's subject detail aggregates deadlines
// (progreso) and subject deletion must cascade-delete them (design
// amendment 6 — matches schedule_slots' FK behavior).
export const deadlines = sqliteTable('deadlines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull(),
  // Local naive datetime, ISO `YYYY-MM-DDTHH:mm`, no timezone offset (design
  // §3a "the DST rule") — interpreted in the machine's local zone.
  dueAt: text('due_at').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false)
})

// An arbitrary file attached to a subject (spec "materia-attachments").
// Cascade-deleted with the subject, same rule as scheduleSlots and
// deadlines. The DB row is the source of truth for existence — the file
// itself is copied into `userData/attachments/<subjectId>/<uuid>-<name>`
// (design "Technical Approach"). `storedPath` is stored RELATIVE to
// userData, never absolute, so a machine-specific userData root never
// leaks into the DB and the app's only join point stays
// `resolveAttachmentPath` (design "Path Handling").
export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  storedPath: text('stored_path').notNull(),
  // NULL in v1 — no mime-detection library in the frozen stack; the OS
  // decides how to open the file via `shell.openPath` (design "mimeType
  // v1"). Column reserved for a future slice.
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes').notNull(),
  // Reserved for a future rename/title-editing UI (spec "First-Slice
  // Non-Goals") — this slice never writes or exposes it.
  title: text('title'),
  createdAt: text('created_at').notNull(),
  // Closed set 'pending' | 'indexed' | 'not-indexable' (attachment-fts-index
  // design "Status storage", spec "Status lifecycle"), zod-owned — same
  // no-SQL-constraint precedent as `subjects.outcome`/`deadlines.type`.
  // Defaults every pre-existing row to 'pending' on migration, which is
  // exactly what lets Sincronizar backfill them (spec "Sincronizar picks up
  // pre-existing and stuck attachments").
  indexStatus: text('index_status').notNull().default('pending'),
  // Provenance marker (cli-generated-artifacts spec "Origin provenance
  // column and badge", design "Storage / Migration"): 'user' for a normal
  // upload, 'ai-generated' for a document the ask-generated-artifacts save
  // path wrote on the model's behalf. Additive, no CHECK constraint — same
  // no-SQL-constraint precedent as `indexStatus`/`subjects.outcome`.
  // Migration 0008 defaults every pre-existing row to 'user', same rule as
  // `indexStatus`'s migration 0006.
  origin: text('origin').notNull().default('user')
})

// One chunk of extracted attachment text (attachment-fts-index design
// "Storage"). Cascade-deleted with its attachment via FK, same rule as
// every other subject-owned child table — this is what the FTS5 AD sync
// trigger on `attachment_chunks_fts` (migration 0007) rides on to stay
// consistent under delete, with zero app-side dual-write code (spec
// "Delete cascade"). `subjectId` is denormalized (no FK) purely as a query
// filter, same flat-column style as `askMessageCitations` — retrieval scopes
// by subject without a JOIN through `attachments`.
export const attachmentChunks = sqliteTable('attachment_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  attachmentId: integer('attachment_id')
    .notNull()
    .references(() => attachments.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  // 1-based source page for a PDF-derived chunk (page-number citations,
  // migration 0010); NULL for chunks of un-paged formats (docx/txt/md/csv/
  // xlsx) and for rows indexed before pages existed. Not part of the FTS
  // index — `attachment_chunks_fts` keeps mapping only `text`.
  page: integer('page')
})

// A durable ask-panel Q&A thread (design D4, spec "ask-history"). Global
// by construction — deliberately has NO FK to `subjects`/`programs`
// (proposal Decision 4): `composeManifest()` already iterates every subject
// unfiltered and the panel mounts once at `Shell` level, so scoping a
// conversation to one subject would be wrong, not merely simpler. Do not
// "fix" this toward a subject FK by analogy with `attachments`.
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Derived once from the first question at creation, truncated to
  // `ASK_TITLE_MAX_CHARS` (domain/limits.ts) — no rename affordance in v1.
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  // Touched on every appended turn; resume-on-open and the browse list both
  // order by this (`updatedAt DESC, id DESC` — the id tiebreak matters
  // because this app's local-naive timestamps only carry minute precision).
  updatedAt: text('updated_at').notNull()
})

// One turn of a conversation, written ONLY on a completed askService
// outcome (design D1, spec "Write-on-Completion Turn Persistence") — typed
// errors and in-flight-at-quit questions never reach this table.
export const askMessages = sqliteTable('ask_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  // Mirrors `askResultSchema`'s discriminant: 'answer' | 'general' |
  // 'not-found', zod-owned. No SQL CHECK, no enum table — verified
  // precedent (`subjects.outcome`, `deadlines.type`, `finalExams.result`
  // are all plain `text` with the closed set enforced only at the
  // application layer).
  kind: text('kind').notNull(),
  // NULL for 'not-found' — the variant that carries no model text at all.
  answer: text('answer'),
  // UNCONSTRAINED text (proposal Decision 5 — the provider-seam
  // constraint): only the write-side `askModelSchema` enum gates this at
  // the IPC boundary. A persisted row must outlive the current 3-key model
  // set, and the read-side contract widens this to `z.string()` on purpose
  // — see design D5. This column MUST NEVER grow a SQL CHECK/enum table.
  model: text('model').notNull(),
  createdAt: text('created_at').notNull()
})

// A citation attached to one `ask_messages` row (design D4, proposal
// Decision 1: normalized child table, not a JSON column — zero JSON-column
// precedent anywhere in this schema). Nullable per-kind columns mirror the
// discriminated `archivo` | `dato` union in `shared/ipc/ask.ts`'s
// `citationSchema`, the same shape `scheduleSlots`/`deadlines`/`finalExams`
// already use for "one row per structured item".
export const askMessageCitations = sqliteTable('ask_message_citations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: integer('message_id')
    .notNull()
    .references(() => askMessages.id, { onDelete: 'cascade' }),
  // 'archivo' | 'dato', zod-owned — same no-SQL-constraint rule as above.
  kind: text('kind').notNull(),
  // 'archivo' only:
  subject: text('subject'),
  file: text('file'),
  // 'archivo' only, and even there OPTIONAL (page-number citations,
  // migration 0010): the cited PDF page, NULL for non-paged documents and
  // for every row persisted before pages existed.
  page: integer('page'),
  // 'dato' only:
  section: text('section'),
  label: text('label')
})

// Generic key/value settings store (design D5). The claude executable
// override (`claude.executableOverride`) is the first user, but the table
// is intentionally not single-purpose — future settings reuse it without a
// new migration. `value` is NOT NULL: "no override" is represented by the
// ROW's absence, never by an empty string (see
// `sqliteAppSettingsRepository.ts`'s `set(key, null)` → DELETE behavior).
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
