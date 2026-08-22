import path from 'node:path'
import { z } from 'zod'
import { sanitizeFileName } from '../../adjuntos/domain/attachmentPaths'
import type { AskArtifactDropReason } from '../../../shared/ipc/ask'
import type { ArtifactExtraction } from './artifactBlock'
import { ASK_ARTIFACT_MAX_CONTENT_BYTES } from './limits'

// THE validation gate (design "Validation Gate", spec "Validation gate
// enforces shape, filename, size, and a single block structurally" /
// "Subject resolution by exact name match only"). This is the SINGLE gate a
// model-produced artifact must clear before `askService` may call the SINGLE
// write call site — the bounded exception to "model output never triggers an
// app action" (`AskTranscript.tsx` invariant).
//
// `sanitizeFileName` is REUSED from `adjuntos/domain/attachmentPaths`, never
// reimplemented — same cross-slice pure-domain import precedent as ask
// importing `cli/providerSpec`.

/** One resolvable subject: the same `{id, name}` shape `composeManifest` reads. */
export interface ArtifactGateSubject {
  id: number
  name: string
}

export type ArtifactGateResult =
  | { kind: 'none' }
  | { kind: 'dropped'; reason: AskArtifactDropReason }
  | { kind: 'valid'; subjectId: number; subjectName: string; fileName: string; content: string }

// Non-strict, both fields trimmed non-empty (design "Wire Format" — the
// header line is parsed against a local zod schema).
const artifactHeaderSchema = z.object({
  materia: z.string().trim().min(1),
  fileName: z.string().trim().min(1)
})

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt'])

function dropped(reason: AskArtifactDropReason): ArtifactGateResult {
  return { kind: 'dropped', reason }
}

/**
 * Validates a pre-gate `ArtifactExtraction` against the closed set of drop
 * reasons, resolving its target subject by exact trimmed name match. Pure —
 * `subjects` is the caller-supplied list, never fetched here.
 */
export function validateArtifact(
  extraction: ArtifactExtraction,
  subjects: readonly ArtifactGateSubject[]
): ArtifactGateResult {
  if (extraction.kind === 'none') {
    return { kind: 'none' }
  }

  if (extraction.kind === 'invalid') {
    return dropped(extraction.reason)
  }

  const parsedHeader = safeJsonParse(extraction.headerLine)
  const header = parsedHeader === undefined ? undefined : artifactHeaderSchema.safeParse(parsedHeader)
  if (header === undefined || !header.success) {
    return dropped('invalid-header')
  }

  const sanitizedFileName = sanitizeFileName(header.data.fileName)
  if (!ALLOWED_EXTENSIONS.has(path.extname(sanitizedFileName))) {
    return dropped('invalid-filename')
  }

  const body = extraction.body
  if (body.trim().length === 0) {
    return dropped('empty-content')
  }

  if (Buffer.byteLength(body, 'utf8') > ASK_ARTIFACT_MAX_CONTENT_BYTES) {
    return dropped('oversize')
  }

  const materiaName = header.data.materia
  const matches = subjects.filter((subject) => subject.name.trim() === materiaName)
  if (matches.length === 0) {
    return dropped('unknown-subject')
  }
  if (matches.length > 1) {
    return dropped('ambiguous-subject')
  }

  return {
    kind: 'valid',
    subjectId: matches[0].id,
    subjectName: matches[0].name,
    fileName: sanitizedFileName,
    content: body
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
