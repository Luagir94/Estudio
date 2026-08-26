// Shared IPC contract for the `planificador:*` channels.
//
// Two things live behind these channels, and they are deliberately not the
// same thing:
//
//   - CORRELATIVAS are a rule about a materia. They are written here and READ
//     on the subject payloads (`materias:list` carries the edges,
//     `materias:detail` the full records), exactly the way `clases:*` writes
//     marks that ride on `materias:detail`/`hoy:dashboard` — the surfaces that
//     show them have already fetched the subject.
//   - The DRAFT (`planner_entries`) is a plan about a período. It has no
//     subject payload to ride on, so this module ships the one read channel
//     the feature needs, flat and unfiltered: which período a draft line
//     belongs to is a filter, and filtering is a rendering-time question (the
//     rule `fechas:list` already states).
//
// The draft is PERSISTED and there is deliberately NO "confirmar" command:
// nothing here writes `subjects.period_id`. See the `planner_entries` comment
// in `main/db/schema.ts` for why turning a draft into an enrolment is a
// separate decision, not a button.
//
// Because this module is shared with main it MUST stay framework-free — no
// i18n instance. Every explicit validation message below is a STABLE MACHINE
// KEY (`requiredLevel.invalid`, `prerequisite.selfReference`,
// `prerequisite.cycle`), not prose; the renderer translates it at the render
// site (see `renderer/shared/lib/translateValidationMessage.ts`).
//
// The record shapes for correlativas themselves live in `./materias` (the
// subject payloads carry them, and importing them from here would close a
// cycle), and are re-exported below so a consumer of this slice needs one
// import, not two.
import { z } from 'zod'
import {
  ipcErr,
  ipcOk,
  type IpcResult,
  parsePayload,
  prerequisiteLevelSchema,
  type PrerequisiteLevel,
  subjectPrerequisiteSchema,
  type SubjectPrerequisite
} from './materias'

export { ipcErr, ipcOk, type IpcResult, parsePayload }
export { prerequisiteLevelSchema, type PrerequisiteLevel, subjectPrerequisiteSchema, type SubjectPrerequisite }

const subjectIdSchema = z.number().int().positive()

/**
 * The machine key a cycle-closing edge is refused with.
 *
 * It is a constant rather than a literal at the throw site because THREE
 * places have to agree on it: main's handler (which emits it), the renderer's
 * `validation` catalog (which translates it), and this contract's tests. A
 * typo in any one of them would silently degrade into an untranslated key on
 * screen.
 *
 * Acyclicity cannot be a schema `.refine()` like the self-reference below: it
 * is a question about the edges ALREADY STORED, which no payload carries. The
 * pure rule lives in `shared/domain/prerequisiteGraph.ts` and main runs it
 * against the repository before writing.
 */
export const PREREQUISITE_CYCLE_MESSAGE = 'prerequisite.cycle'

// --- planificador:addPrerequisite ----------------------------------------

export const addPrerequisiteInputSchema = z
  .object({
    /** The subject that HAS the requirement. */
    subjectId: subjectIdSchema,
    /** The subject that IS the requirement. */
    requiresSubjectId: subjectIdSchema,
    requiredLevel: prerequisiteLevelSchema
  })
  // A materia may not be its own correlativa. The cycle guard would catch this
  // too (a self-edge is a loop of length one), but it gets its own key here
  // because it is a clearly different mistake and deserves a clearly different
  // message.
  .refine((input) => input.subjectId !== input.requiresSubjectId, {
    message: 'prerequisite.selfReference',
    path: ['requiresSubjectId']
  })

export type AddPrerequisiteInput = z.infer<typeof addPrerequisiteInputSchema>

// --- planificador:updatePrerequisite --------------------------------------

// The LEVEL is the only editable field, and that is the whole shape of this
// command. Re-pointing an edge at a different materia is a delete plus an
// add — only the add can be cycle-checked, and pretending otherwise would let
// an "update" smuggle in an edge `addPrerequisiteInputSchema` would refuse.
export const updatePrerequisiteInputSchema = z.object({
  id: z.number().int().positive(),
  requiredLevel: prerequisiteLevelSchema
})

export type UpdatePrerequisiteInput = z.infer<typeof updatePrerequisiteInputSchema>

// --- planificador:removePrerequisite --------------------------------------

export const prerequisiteIdInputSchema = z.object({ id: z.number().int().positive() })

export type PrerequisiteIdInput = z.infer<typeof prerequisiteIdInputSchema>

export const deletePrerequisiteResultSchema = z.object({ id: z.number().int() })

export type DeletePrerequisiteResult = z.infer<typeof deletePrerequisiteResultSchema>

// --- planificador:addEntry / planificador:removeEntry ---------------------

// ONE payload shape for both commands, because both address exactly what a
// draft line IS: a período and a materia. Splitting it into two identical
// schemas would only create two things to keep in step (same call
// `shared/ipc/clases.ts` makes for its two clear commands).
export const plannerEntryInputSchema = z.object({
  periodId: z.number().int().positive(),
  subjectId: subjectIdSchema
})

export type PlannerEntryInput = z.infer<typeof plannerEntryInputSchema>

export const plannerEntryRecordSchema = z.object({
  id: z.number().int(),
  periodId: z.number().int(),
  subjectId: z.number().int()
})

export type PlannerEntryRecord = z.infer<typeof plannerEntryRecordSchema>

// Echoes the PAIR that was removed rather than the row's id: the caller never
// knew an id — it knows a período and a materia, and that is what its cache
// is keyed on.
export const plannerEntryRemovedSchema = plannerEntryInputSchema

export type PlannerEntryRemoved = z.infer<typeof plannerEntryRemovedSchema>

// --- planificador:list result ---------------------------------------------

// Every draft line, across every período, flat and unfiltered. The screen
// plans ONE período at a time, but which one is a selection the user changes
// without a round trip, and a payload scoped to the current choice would need
// re-fetching on every flick of the switcher.
export const listPlannerEntriesResultSchema = z.array(plannerEntryRecordSchema)
