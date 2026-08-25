import { z } from 'zod'

// Pure, framework-free domain module (design §4). MUST NOT import electron
// or better-sqlite3 — enforced by tooling/dependencyGuard.mts's
// no-electron-or-sqlite-in-domain rule (see tooling/dependencyGuard.test.ts).

/**
 * Full Subject entity validation (spec: "Subject Field Set"). This is the
 * general-purpose entity shape, reused by both the create flow (slice 2a,
 * a subset of these fields) and the edit flow (slice 2b, adds
 * campusUrl/notas). name/code/color are required; every other field is
 * optional and nullable — no optional field is ever required.
 */
export const subjectSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  code: z.string().trim().min(1, 'code is required'),
  color: z.string().trim().min(1, 'color is required'),
  docente: z.string().trim().min(1).nullable().optional(),
  contacto: z.string().trim().min(1).nullable().optional(),
  comision: z.string().trim().min(1).nullable().optional(),
  aula: z.string().trim().min(1).nullable().optional(),
  campusUrl: z.string().trim().min(1).nullable().optional(),
  groupUrl: z.string().trim().min(1).nullable().optional(),
  notas: z.string().nullable().optional(),
  attendanceMinPercent: z.number().min(0).max(100).nullable().optional()
})

export type SubjectInput = z.infer<typeof subjectSchema>

/** Minimal, zod-version-agnostic issue shape — only what callers need. */
export interface SubjectValidationIssue {
  path: PropertyKey[]
  message: string
}

export type SubjectValidationResult =
  { ok: true; subject: SubjectInput } | { ok: false; errors: SubjectValidationIssue[] }

/**
 * Validates a raw payload against the Subject entity shape. Pure function:
 * no side effects, no I/O. Callers (IPC handlers, forms) decide what to do
 * with a failed result.
 */
export function createSubject(input: unknown): SubjectValidationResult {
  const result = subjectSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    }
  }
  return { ok: true, subject: result.data }
}
