// Minimal deadline RECORD shape only — the `entregas:*` command schemas
// (create/update/setDone/delete + validation) ship in slice 4 (design
// amendment 7). This file exists now because `materias:detail` aggregates
// a subject's deadlines (spec: subject-detail "Computed Detail Values" —
// progreso) and subject deletion must report/cascade them (spec:
// "Subject Deletion Cascade").
import { z } from 'zod'

export const deadlineRecordSchema = z.object({
  id: z.number().int(),
  subjectId: z.number().int(),
  title: z.string(),
  type: z.string(),
  // Local naive datetime, ISO `YYYY-MM-DDTHH:mm` (design §3a).
  dueAt: z.string(),
  done: z.boolean()
})

export type DeadlineRecord = z.infer<typeof deadlineRecordSchema>
