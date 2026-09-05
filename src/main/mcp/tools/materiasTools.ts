import { z } from 'zod'
import {
  createSubjectInputSchema,
  setSubjectOutcomeInputSchema,
  subjectIdInputSchema,
  updateSubjectScheduleInputSchema
} from '../../../shared/ipc/materias'
import type { MateriasService } from '../../materias/materiasService'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'
import { pageSummary, paginate, paginationInputSchema } from '../domain/pagination'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The six `materias_*` MCP tools (design "defineTool and schema mapping",
// tasks 5.1-5.2). Every `inputSchema` below IS the existing
// `src/shared/ipc/materias.ts` contract, not a redeclared shape —
// `mcpServerFactory`'s second full-schema parse (PR3) is what enforces the
// object-level refinements the SDK's own rebuilt shape drops. `exec` mirrors
// `registerMateriasHandlers.ts`'s own convention: a `null` result means
// NOT_FOUND. `summarize` NEVER reads a free-text input field (design "Audit
// summary contract") — only identifiers and counts reach the returned
// string, matching the contract's own examples (`materias_create → id=12`).

export interface CreateMateriasToolsDeps {
  repository: SubjectRepository
  materiasService: MateriasService
}

/**
 * `materias_delete` MUST call `materiasService.deleteSubject`, never
 * `repository.remove` directly — that is the entire reason PR4 extracted the
 * service: both the IPC handler and this MCP tool have to run the exact same
 * row-then-attachment-directory cascade, or a subject deleted over MCP could
 * leave its attachment directory orphaned.
 */
export function createMateriasTools({
  repository,
  materiasService
}: CreateMateriasToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'materias_list',
      slice: 'materias',
      action: 'read',
      description:
        'Lists subjects with their schedule, period and status facts, one page at a time. Returns `total` and `nextOffset`; pass `nextOffset` back as `offset` to continue.',
      inputSchema: paginationInputSchema,
      exec: (input) => paginate(repository.list(), input),
      summarize: (_input, result) => pageSummary('materias_list', result)
    }),
    defineTool({
      name: 'materias_detail',
      slice: 'materias',
      action: 'read',
      description: 'Reads one subject by id, with its slots, deadlines, finals and correlativas.',
      inputSchema: subjectIdInputSchema,
      exec: (input) => repository.detail(input.id),
      summarize: (input, result) =>
        result ? `materias_detail id=${input.id}` : `materias_detail id=${input.id}: not found`
    }),
    defineTool({
      name: 'materias_create',
      slice: 'materias',
      action: 'write',
      effect: 'create',
      description: 'Creates a subject with its initial schedule slots.',
      inputSchema: createSubjectInputSchema,
      // Spike B (task 5.1) resolved NEGATIVE for this specific field: the
      // installed SDK (1.30.0) drops `periodId` — a `z.preprocess`/`ZodPipe`
      // (`requiredPeriodId` in `shared/ipc/materias.ts`) — from the
      // advertised `tools/list` `required` array, even though it is a real
      // required field. Fallback applied per design: override ONLY the
      // ADVERTISED shape's `periodId` with `z.unknown()`, which restores it
      // to `required` (verified: an unknown-typed field DOES render as
      // required in this SDK) at the cost of its advertised numeric type.
      // `inputSchema` above is untouched, so real validation (the double
      // parse in `mcpServerFactory.ts`) still enforces the exact contract.
      advertisedShapeOverrides: { periodId: z.unknown() },
      exec: (input) => repository.create(input),
      summarize: (_input, result) => `materias_create → id=${result?.id}`
    }),
    defineTool({
      name: 'materias_update_schedule',
      slice: 'materias',
      action: 'write',
      effect: 'update',
      description: "Replaces a subject's general fields and full slot set atomically.",
      inputSchema: updateSubjectScheduleInputSchema,
      exec: (input) => repository.updateSchedule(input),
      summarize: (input) => `materias_update_schedule id=${input.id}`
    }),
    defineTool({
      name: 'materias_delete',
      slice: 'materias',
      action: 'write',
      effect: 'delete',
      description: 'Deletes a subject and best-effort removes its attachment directory.',
      inputSchema: subjectIdInputSchema,
      exec: (input) => materiasService.deleteSubject(input.id),
      summarize: (input, result) =>
        result ? `materias_delete id=${input.id}` : `materias_delete id=${input.id}: not found`
    }),
    defineTool({
      name: 'materias_set_outcome',
      slice: 'materias',
      action: 'write',
      effect: 'update',
      description: 'Records the outcome (and grade, if applicable) a subject closed with.',
      inputSchema: setSubjectOutcomeInputSchema,
      exec: (input) => repository.setOutcome(input),
      summarize: (input, result) =>
        result ? `materias_set_outcome id=${input.id}` : `materias_set_outcome id=${input.id}: not found`
    })
  ]
}
