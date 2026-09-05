import { z } from 'zod'
import {
  createDeadlineInputSchema,
  deadlineIdInputSchema,
  setDeadlineDoneInputSchema,
  updateDeadlineInputSchema
} from '../../../shared/ipc/entregas'
import type { DeadlineRepository } from '../../entregas/adapters/sqliteDeadlineRepository'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The five `entregas_*` MCP tools (design "defineTool and schema mapping",
// task 7.1). Every `inputSchema` below IS the existing
// `src/shared/ipc/entregas.ts` contract, not a redeclared shape — the same
// rule `materiasTools.ts` (PR5) and `carrerasTools.ts` (PR6) follow. `exec`
// mirrors `registerEntregasHandlers.ts`'s own convention: a `null` result
// means NOT_FOUND. `DeadlineRepository.remove` returns a `boolean`, not a
// record, so `entregas_delete` maps `true`/`false` to `{ id } | null` itself,
// matching `deleteDeadlineResultSchema`/`registerEntregasHandlers.ts`'s
// `ipcOk({ id })` shape. `summarize` NEVER reads a free-text input field
// (design "Audit summary contract") — only identifiers and counts reach the
// returned string.
//
// Preprocess audit (task 7.1's mandatory check, per PR5's Spike B finding
// that a `z.preprocess`-backed REQUIRED field is dropped from the advertised
// `tools/list` `required` array): `shared/ipc/entregas.ts` has ZERO
// `z.preprocess` fields — every field on `createDeadlineInputSchema` /
// `updateDeadlineInputSchema` is a plain `z.string()`/`z.number()` chain.
// No `advertisedShapeOverrides` is needed anywhere in this module.

export interface CreateEntregasToolsDeps {
  repository: DeadlineRepository
}

export function createEntregasTools({ repository }: CreateEntregasToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'entregas_list',
      slice: 'entregas',
      action: 'read',
      description: 'Lists every deadline (entrega) with its subject name and color.',
      inputSchema: z.object({}),
      exec: () => repository.list(),
      summarize: (_input, result) => `entregas_list → ${result?.length ?? 0} rows`
    }),
    defineTool({
      name: 'entregas_create',
      slice: 'entregas',
      action: 'write',
      effect: 'create',
      description: 'Creates a deadline (entrega) for a subject.',
      inputSchema: createDeadlineInputSchema,
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `entregas_create → id=${result?.id}`
    }),
    defineTool({
      name: 'entregas_update',
      slice: 'entregas',
      action: 'write',
      effect: 'update',
      description: 'Corrects an existing deadline (entrega) in place.',
      inputSchema: updateDeadlineInputSchema,
      exec: (input) => repository.update(input),
      summarize: (input, result) =>
        result ? `entregas_update id=${input.id}` : `entregas_update id=${input.id}: not found`
    }),
    defineTool({
      name: 'entregas_set_done',
      slice: 'entregas',
      action: 'write',
      effect: 'update',
      // Not a toggle: the caller states the value it wants, which is what
      // makes this tool idempotent (`effect: 'update'`). A description that
      // said "toggles" would advertise the opposite.
      description: 'Marks a deadline (entrega) as done or pending, as stated by the caller.',
      inputSchema: setDeadlineDoneInputSchema,
      exec: (input) => repository.setDone(input.id, input.done),
      summarize: (input, result) =>
        result ? `entregas_set_done id=${input.id}` : `entregas_set_done id=${input.id}: not found`
    }),
    defineTool({
      name: 'entregas_delete',
      slice: 'entregas',
      action: 'write',
      effect: 'delete',
      description: 'Deletes a deadline (entrega) entirely; it never marks it done.',
      inputSchema: deadlineIdInputSchema,
      exec: (input) => (repository.remove(input.id) ? { id: input.id } : null),
      summarize: (input, result) =>
        result ? `entregas_delete id=${input.id}` : `entregas_delete id=${input.id}: not found`
    })
  ]
}
