import { z } from 'zod'
import {
  createFinalExamInputSchema,
  finalExamIdInputSchema,
  updateFinalExamInputSchema
} from '../../../shared/ipc/finales'
import type { FinalExamRepository } from '../../finales/adapters/sqliteFinalExamRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The three `finales_*` MCP tools (design "defineTool and schema mapping",
// task 8.3). Every `inputSchema` below IS the existing
// `src/shared/ipc/finales.ts` contract, not a redeclared shape — the same
// rule every prior tools module (PR5-7, and this PR's `parcialesTools.ts`)
// follows. `exec` mirrors `registerFinalesHandlers.ts`'s own convention: a
// `null` result means NOT_FOUND. `FinalExamRepository.remove` returns a
// `boolean`, not a record, so `finales_delete` maps `true`/`false` to
// `{ id } | null` itself, matching
// `deleteFinalExamResultSchema`/`registerFinalesHandlers.ts`'s
// `ipcOk({ id })` shape (same divergence PR7's entregas/fechas disclosed).
// `summarize` NEVER reads a free-text input field (design "Audit summary
// contract") — only identifiers reach the returned string.
//
// Preprocess audit (task 8.3's mandatory check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/finales.ts` has TWO
// `z.preprocess` fields. `grade` (`optionalGrade`, update-only) is
// `.default(null)` — genuinely optional, no override needed (same shape as
// carreras' `institution`, PR6, and fechas' `endsOn`, PR7). `takenOn`
// (`optionalDate`) is `.nullable()` WITHOUT a default — a REAL required
// field, the same shape class as `parciales.ts`'s `takenOn` (this PR, task
// 8.2) and materias' `periodId` (PR5 Spike B) — and this module's RED test
// confirmed the SAME bug empirically: the installed SDK drops `takenOn` from
// the advertised `required` array. Fallback applied per design/PR5 precedent:
// override ONLY the ADVERTISED shape's `takenOn` with `z.unknown()` on BOTH
// `finales_create` and `finales_update` (the field is required, unchanged, in
// both schemas). `inputSchema` itself is untouched in both tools, so real
// validation (the double parse in `mcpServerFactory.ts`) still enforces the
// exact contract.

export interface CreateFinalesToolsDeps {
  repository: FinalExamRepository
}

export function createFinalesTools({ repository }: CreateFinalesToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'finales_create',
      slice: 'finales',
      action: 'write',
      effect: 'create',
      description: 'Creates a final exam (mesa) with its taken-on date and result.',
      inputSchema: createFinalExamInputSchema,
      advertisedShapeOverrides: { takenOn: z.unknown() },
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `finales_create → id=${result?.id}`
    }),
    defineTool({
      name: 'finales_update',
      slice: 'finales',
      action: 'write',
      effect: 'update',
      description: 'Corrects an existing final exam (mesa) in place.',
      inputSchema: updateFinalExamInputSchema,
      advertisedShapeOverrides: { takenOn: z.unknown() },
      exec: (input) => repository.update(input),
      summarize: (input, result) =>
        result ? `finales_update id=${input.id}` : `finales_update id=${input.id}: not found`
    }),
    defineTool({
      name: 'finales_delete',
      slice: 'finales',
      action: 'write',
      effect: 'delete',
      description: 'Deletes a final exam (mesa) entirely.',
      inputSchema: finalExamIdInputSchema,
      exec: (input) => (repository.remove(input.id) ? { id: input.id } : null),
      summarize: (input, result) =>
        result ? `finales_delete id=${input.id}` : `finales_delete id=${input.id}: not found`
    })
  ]
}
