// Shared IPC contract for the `horario:*` channel (design §2: "horario:week
// (query only — no slot commands exist)"). Imported by BOTH main (parses
// nothing incoming — this is a no-payload query) and renderer (parses the
// response before caching). Reuses `subjectWithSlotsSchema` from
// `materias.ts` rather than duplicating it: Horario is a read-only
// projection over the SAME subjects+slots data materias:list already
// serves (spec: "Horario MUST be a read-only projection over subjects'
// schedule slots") — there is deliberately no separate horario table.
import { z } from 'zod'
import { subjectWithSlotsSchema } from './materias'

export const weekScheduleResultSchema = z.array(subjectWithSlotsSchema)

export type WeekScheduleResult = z.infer<typeof weekScheduleResultSchema>
