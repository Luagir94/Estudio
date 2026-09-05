import { z } from 'zod'
import { classDayInputSchema, setAttendanceInputSchema } from '../../../shared/ipc/clases'
import type { ClaseRepository } from '../../clases/adapters/sqliteClaseRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The two `clases_*` MCP tools (design "defineTool and schema mapping",
// task 8.1). Every `inputSchema` below IS the existing
// `src/shared/ipc/clases.ts` contract, not a redeclared shape — the same
// rule `materiasTools.ts` (PR5), `carrerasTools.ts` (PR6) and
// `entregasTools.ts`/`fechasTools.ts` (PR7) follow. `summarize` NEVER reads a
// free-text input field (design "Audit summary contract") — only identifiers
// reach the returned string, per the design's own worked example
// (`clases_set_attendance subjectId=4 date=2026-09-02`).
//
// ONLY attendance is exposed here — spec "clases exposes attendance only".
// `clases:saveNote`/`clases:deleteNote` route through `ClassNoteWriterPort`
// into `attachmentService` (`registerClasesHandlers.ts:92-129`), which is
// adjuntos territory (file write + FTS re-index); they are deliberately
// excluded from this catalog and MUST NOT be added here.
//
// `clases_clear_attendance` mirrors `registerClasesHandlers.ts`'s own
// `clases:clearAttendance` convention EXACTLY, not the entregas/fechas
// `remove`-returns-boolean convention: the IPC handler ignores
// `repository.clearAttendance`'s boolean and always answers `ipcOk` — "a
// NOT_FOUND here would turn the second click of a toggle, or a double-submit
// of the modal, into an error message about a state the user already has."
// So this tool's `exec` never returns `null`; it always echoes the cleared
// `(subjectId, date)` pair, exactly like the IPC handler always echoes it.
//
// Preprocess audit (mandatory per-module check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/clases.ts` has ZERO
// `z.preprocess` fields — `setAttendanceInputSchema`/`classDayInputSchema`
// are built entirely from plain `z.number()`/`z.string().regex(...)`/
// `z.enum(...)` chains. No `advertisedShapeOverrides` is needed anywhere in
// this module.

export interface CreateClasesToolsDeps {
  repository: ClaseRepository
}

export function createClasesTools({ repository }: CreateClasesToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'clases_set_attendance',
      slice: 'clases',
      action: 'write',
      effect: 'update',
      description: 'Records or corrects the attendance mark for one class, addressed by subject and day.',
      inputSchema: setAttendanceInputSchema,
      exec: (input) => repository.setAttendance(input),
      summarize: (input) => `clases_set_attendance subjectId=${input.subjectId} date=${input.date}`
    }),
    defineTool({
      name: 'clases_clear_attendance',
      slice: 'clases',
      action: 'write',
      effect: 'delete',
      description: 'Clears the attendance mark for one class, back to unmarked.',
      inputSchema: classDayInputSchema,
      exec: (input) => {
        repository.clearAttendance(input)
        return { subjectId: input.subjectId, date: input.date }
      },
      summarize: (input) => `clases_clear_attendance subjectId=${input.subjectId} date=${input.date}`
    })
  ]
}
