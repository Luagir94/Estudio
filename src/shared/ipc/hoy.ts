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
import { subjectWithSlotsSchema } from './materias'

export const dashboardResultSchema = z.object({
  subjects: z.array(subjectWithSlotsSchema),
  deadlines: z.array(deadlineWithSubjectSchema)
})

export type DashboardResult = z.infer<typeof dashboardResultSchema>
