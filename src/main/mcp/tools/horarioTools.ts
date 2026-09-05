import { z } from 'zod'
import type { SubjectRepository } from '../../materias/adapters/sqliteSubjectRepository'
import { pageSummary, paginate, paginationInputSchema } from '../domain/pagination'
import { defineTool, type ToolDescriptor } from '../domain/toolDescriptor'

// The read-only `horario_week` MCP tool (design "defineTool and schema
// mapping", task 5.3). Reuses the SAME subjects+slots query
// `registerHorarioHandlers.ts`/`materias:list` already read — Horario is a
// projection over `materias`'s own data, not a table of its own (design
// §2/feature-slice skill: "Reuse an existing repository when the slice is a
// read-only projection over data another slice owns"). The tool carries the
// `horario` slice for permission purposes while reading through the
// `materias` repository, exactly like the existing IPC handler.

export interface CreateHorarioToolsDeps {
  repository: SubjectRepository
}

export function createHorarioTools({ repository }: CreateHorarioToolsDeps): ToolDescriptor<z.ZodObject, unknown>[] {
  return [
    defineTool({
      name: 'horario_week',
      slice: 'horario',
      action: 'read',
      description:
        'Reads the weekly schedule projected from subjects and their slots, one page of subjects at a time. Returns `total` and `nextOffset`; pass `nextOffset` back as `offset` to continue.',
      inputSchema: paginationInputSchema,
      exec: (input) => paginate(repository.list(), input),
      summarize: (_input, result) => pageSummary('horario_week', result)
    })
  ]
}
