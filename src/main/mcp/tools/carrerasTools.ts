import { z } from 'zod'
import {
  createPeriodInputSchema,
  createProgramInputSchema,
  periodIdInputSchema,
  programIdInputSchema,
  updatePeriodInputSchema,
  updateProgramInputSchema
} from '../../../shared/ipc/carreras'
import type { ProgramRepository } from '../../carreras/adapters/sqliteProgramRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The eight `carreras_*` MCP tools (design "defineTool and schema mapping",
// task 6.1). Every `inputSchema` below IS the existing
// `src/shared/ipc/carreras.ts` contract, not a redeclared shape — the same
// rule `materiasTools.ts` (PR5) follows. `exec` mirrors
// `registerCarrerasHandlers.ts`'s own convention: a `null` result means
// NOT_FOUND. `summarize` NEVER reads a free-text input field (design "Audit
// summary contract") — only identifiers and counts reach the returned
// string.
//
// Preprocess audit (task 6.1's mandatory check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/carreras.ts` has exactly one
// `z.preprocess` field, `optionalTextField` (used for `institution` on both
// `createProgramInputSchema` and `updateProgramInputSchema`). It is NOT
// affected — it is `.nullable().default(null)`, i.e. genuinely optional, so
// it belongs OUTSIDE `required` regardless of the SDK's rendering quirk. No
// other field in this contract is preprocess-backed. Confirmed by this
// module's `tools/list JSON-schema rendering` test: no carreras field needs
// `advertisedShapeOverrides`.

export interface CreateCarrerasToolsDeps {
  repository: ProgramRepository
}

export function createCarrerasTools({ repository }: CreateCarrerasToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'carreras_list',
      slice: 'carreras',
      action: 'read',
      description: 'Lists every carrera with its periods, subject roll-ups and upcoming timeline markers.',
      inputSchema: z.object({}),
      exec: () => repository.list(),
      summarize: (_input, result) => `carreras_list → ${result?.length ?? 0} rows`
    }),
    defineTool({
      name: 'carreras_detail',
      slice: 'carreras',
      action: 'read',
      description: 'Reads one carrera by id, with its periods, subject roll-ups and upcoming timeline markers.',
      inputSchema: programIdInputSchema,
      exec: (input) => repository.detail(input.id),
      summarize: (input, result) =>
        result ? `carreras_detail id=${input.id}` : `carreras_detail id=${input.id}: not found`
    }),
    defineTool({
      name: 'carreras_create',
      slice: 'carreras',
      action: 'write',
      effect: 'create',
      description: 'Creates a carrera with its grading scheme.',
      inputSchema: createProgramInputSchema,
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `carreras_create → id=${result?.id}`
    }),
    defineTool({
      name: 'carreras_update',
      slice: 'carreras',
      action: 'write',
      effect: 'update',
      description: 'Corrects an existing carrera in place; its periods and subjects are untouched.',
      inputSchema: updateProgramInputSchema,
      exec: (input) => repository.update(input),
      summarize: (input, result) =>
        result ? `carreras_update id=${input.id}` : `carreras_update id=${input.id}: not found`
    }),
    defineTool({
      name: 'carreras_delete',
      slice: 'carreras',
      action: 'write',
      effect: 'delete',
      description: 'Deletes a carrera; its periods cascade away and its subjects fall back to sin período.',
      inputSchema: programIdInputSchema,
      exec: (input) => repository.remove(input.id),
      summarize: (input, result) =>
        result ? `carreras_delete id=${input.id}` : `carreras_delete id=${input.id}: not found`
    }),
    defineTool({
      name: 'carreras_create_period',
      slice: 'carreras',
      action: 'write',
      effect: 'create',
      description: 'Creates a period under an existing carrera.',
      inputSchema: createPeriodInputSchema,
      exec: (input) => repository.createPeriod(input),
      summarize: (_input, result) => `carreras_create_period → id=${result?.id} programId=${result?.programId}`
    }),
    defineTool({
      name: 'carreras_update_period',
      slice: 'carreras',
      action: 'write',
      effect: 'update',
      description: "Corrects an existing period's name, kind and dates; it never changes carrera.",
      inputSchema: updatePeriodInputSchema,
      exec: (input) => repository.updatePeriod(input),
      summarize: (input, result) =>
        result
          ? `carreras_update_period id=${input.id} programId=${result.programId}`
          : `carreras_update_period id=${input.id}: not found`
    }),
    defineTool({
      name: 'carreras_delete_period',
      slice: 'carreras',
      action: 'write',
      effect: 'delete',
      description: 'Deletes one period; its subjects survive with a NULL period.',
      inputSchema: periodIdInputSchema,
      exec: (input) => repository.removePeriod(input.id),
      summarize: (input, result) =>
        result ? `carreras_delete_period id=${input.id}` : `carreras_delete_period id=${input.id}: not found`
    })
  ]
}
