// Shared IPC contract for the `hoy:dashboard` channel (design §2: "hoy:
// dashboard"). Imported by BOTH main (parses nothing incoming — a no-payload
// query) and renderer (parses the response before caching). Returns the SAME
// raw subjects+slots and deadlines data `materias:list`/`horario:week` and
// `entregas:list` already serve — Hoy composes its read-model (today's
// classes, week strip, overdue surfacing) in the pure renderer domain layer
// at render time (`hoy/domain/dashboard.ts`), never bakes "now" into this
// cached payload (same precedent as `materias.ts`'s `subjectDetailSchema`
// comment). Zero new persisted fields (spec: "Zero-Navigation Today View").
import { z } from 'zod'
import { deadlineWithSubjectSchema } from './entregas'
import { attendanceRecordSchema, classNoteRecordSchema, subjectWithSlotsSchema } from './materias'

export const dashboardResultSchema = z.object({
  subjects: z.array(subjectWithSlotsSchema),
  deadlines: z.array(deadlineWithSubjectSchema),
  // Attendance marks and class apuntes ride the SAME payload rather than a
  // parallel per-day query, and they arrive UNFILTERED — main never asks what
  // "today" is.
  //
  // That is not an oversight, it is the rule this module already states about
  // everything else it carries: "now" is a rendering-time concern. A payload
  // filtered to today's date in main would be correct exactly until midnight,
  // after which the TanStack cache would hand Hoy yesterday's marks for
  // today's classes — the one failure mode this whole read-model was shaped to
  // avoid. The renderer crosses the rows with its own clock
  // (`clases/domain/classOccurrence.ts`).
  //
  // Apunte BODIES travel too, not just a "has an apunte" flag: the apunte
  // button on a ClassRow opens the class modal, which prefills the textarea
  // with what is already written. Sending a flag would buy nothing and force a
  // second read path the moment the modal opened.
  attendance: z.array(attendanceRecordSchema),
  classNotes: z.array(classNoteRecordSchema)
})

export type DashboardResult = z.infer<typeof dashboardResultSchema>
