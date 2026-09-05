import { z } from 'zod'
import {
  academicDateIdInputSchema,
  createAcademicDateInputSchema,
  updateAcademicDateInputSchema
} from '../../../shared/ipc/fechas'
import type { AcademicDateRepository } from '../../fechas/adapters/sqliteAcademicDateRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The four `fechas_*` MCP tools (design "defineTool and schema mapping",
// task 7.2). Every `inputSchema` below IS the existing
// `src/shared/ipc/fechas.ts` contract, not a redeclared shape — the same
// rule `materiasTools.ts` (PR5), `carrerasTools.ts` (PR6) and
// `entregasTools.ts` (PR7) follow. `exec` mirrors
// `registerFechasHandlers.ts`'s own convention: a `null` result means
// NOT_FOUND. `AcademicDateRepository.remove` returns a `boolean`, not a
// record, so `fechas_delete` maps `true`/`false` to `{ id } | null` itself,
// matching `deleteAcademicDateResultSchema`/`registerFechasHandlers.ts`'s
// `ipcOk({ id })` shape. `summarize` NEVER reads a free-text input field
// (design "Audit summary contract") — only identifiers and counts reach the
// returned string.
//
// Preprocess audit (task 7.2's mandatory check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/fechas.ts` has exactly ONE
// `z.preprocess` field, `optionalEndDate` (used for `endsOn` on both
// `createAcademicDateInputSchema` and `updateAcademicDateInputSchema`). It is
// NOT affected — it is `.nullable().default(null)`, i.e. genuinely optional
// (same shape as carreras' `institution` field, PR6), so it belongs OUTSIDE
// `required` regardless of the SDK's rendering quirk. No other field in this
// contract is preprocess-backed. Confirmed by this module's `tools/list
// JSON-schema rendering` test: no fechas field needs
// `advertisedShapeOverrides`.

export interface CreateFechasToolsDeps {
  repository: AcademicDateRepository
}

export function createFechasTools({ repository }: CreateFechasToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'fechas_list',
      slice: 'fechas',
      action: 'read',
      description: 'Lists every administrative date (fecha) across every carrera, chronologically.',
      inputSchema: z.object({}),
      exec: () => repository.list(),
      summarize: (_input, result) => `fechas_list → ${result?.length ?? 0} rows`
    }),
    defineTool({
      name: 'fechas_create',
      slice: 'fechas',
      action: 'write',
      effect: 'create',
      description: 'Creates an administrative date (fecha) for a carrera.',
      inputSchema: createAcademicDateInputSchema,
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `fechas_create → id=${result?.id}`
    }),
    defineTool({
      name: 'fechas_update',
      slice: 'fechas',
      action: 'write',
      effect: 'update',
      description: 'Corrects an existing administrative date (fecha) in place; it never changes carrera.',
      inputSchema: updateAcademicDateInputSchema,
      exec: (input) => repository.update(input),
      summarize: (input, result) =>
        result ? `fechas_update id=${input.id}` : `fechas_update id=${input.id}: not found`
    }),
    defineTool({
      name: 'fechas_delete',
      slice: 'fechas',
      action: 'write',
      effect: 'delete',
      description: 'Deletes an administrative date (fecha) entirely.',
      inputSchema: academicDateIdInputSchema,
      exec: (input) => (repository.remove(input.id) ? { id: input.id } : null),
      summarize: (input, result) =>
        result ? `fechas_delete id=${input.id}` : `fechas_delete id=${input.id}: not found`
    })
  ]
}
