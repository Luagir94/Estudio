import { z } from 'zod'
import {
  createPartialExamInputSchema,
  partialExamIdInputSchema,
  updatePartialExamInputSchema
} from '../../../shared/ipc/parciales'
import type { PartialExamRepository } from '../../parciales/adapters/sqlitePartialExamRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The three `parciales_*` MCP tools (design "defineTool and schema mapping",
// task 8.2). Every `inputSchema` below IS the existing
// `src/shared/ipc/parciales.ts` contract, not a redeclared shape — the same
// rule every prior tools module (PR5-7) follows. `exec` mirrors
// `registerParcialesHandlers.ts`'s own convention: a `null` result means
// NOT_FOUND. `PartialExamRepository.remove` returns a `boolean`, not a
// record, so `parciales_delete` maps `true`/`false` to `{ id } | null` itself,
// matching `deletePartialExamResultSchema`/`registerParcialesHandlers.ts`'s
// `ipcOk({ id })` shape (same divergence PR7's entregas/fechas disclosed).
// `summarize` NEVER reads a free-text input field (design "Audit summary
// contract") — only identifiers reach the returned string.
//
// Preprocess audit (task 8.2's mandatory check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/parciales.ts` has TWO
// `z.preprocess` fields. `grade` (`optionalGrade`) is `.default(null)` —
// genuinely optional, no override needed (same shape as carreras'
// `institution`, PR6, and fechas' `endsOn`, PR7). `takenOn` (`optionalDate`)
// is `.nullable()` WITHOUT a default — a REAL required field, the same shape
// class as materias' `periodId` (PR5 Spike B) — and this module's RED test
// confirmed the SAME bug empirically: the installed SDK drops `takenOn` from
// the advertised `required` array. Fallback applied per design/PR5 precedent:
// override ONLY the ADVERTISED shape's `takenOn` with `z.unknown()` on BOTH
// `parciales_create` and `parciales_update` (the field is required, unchanged,
// in both schemas). `inputSchema` itself is untouched in both tools, so real
// validation (the double parse in `mcpServerFactory.ts`) still enforces the
// exact contract.

export interface CreateParcialesToolsDeps {
  repository: PartialExamRepository
}

export function createParcialesTools({ repository }: CreateParcialesToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'parciales_create',
      slice: 'parciales',
      action: 'write',
      description: 'Creates a partial exam (parcial) with its taken-on date, result and grade.',
      inputSchema: createPartialExamInputSchema,
      advertisedShapeOverrides: { takenOn: z.unknown() },
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `parciales_create → id=${result?.id}`
    }),
    defineTool({
      name: 'parciales_update',
      slice: 'parciales',
      action: 'write',
      description: 'Corrects an existing partial exam (parcial) in place.',
      inputSchema: updatePartialExamInputSchema,
      advertisedShapeOverrides: { takenOn: z.unknown() },
      exec: (input) => repository.update(input),
      summarize: (input, result) =>
        result ? `parciales_update id=${input.id}` : `parciales_update id=${input.id}: not found`
    }),
    defineTool({
      name: 'parciales_delete',
      slice: 'parciales',
      action: 'write',
      description: 'Deletes a partial exam (parcial) entirely.',
      inputSchema: partialExamIdInputSchema,
      exec: (input) => (repository.remove(input.id) ? { id: input.id } : null),
      summarize: (input, result) =>
        result ? `parciales_delete id=${input.id}` : `parciales_delete id=${input.id}: not found`
    })
  ]
}
