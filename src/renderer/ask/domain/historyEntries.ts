// Pure mapping from persisted messages + the memory-boundary window marker
// into transcript entries (design D6, spec "Memory-Boundary Honesty
// Marker"). Reuses the EXISTING `AskEntry` kinds for `answer`/`general`;
// `not-found` becomes a `state` entry with the app's own `ASK_NOT_FOUND`
// copy — there is no dedicated not-found kind. `boundary` is the shared
// `AskEntry` kind `AskTranscript` renders: it lands at the EXACT cut point
// `computeTranscriptWindow` (design D2) computed when building the prompt —
// the same source of truth the server-side marker uses, never re-derived
// here from message counts.
import { SearchX } from 'lucide-react'
import type { AskHistoryMessage, TranscriptWindowMarker } from '../../../shared/ipc/ask'
import type { AskEntry } from '../components/AskTranscript'
import { ASK_NOT_FOUND } from './askDisplay'

// Message ids are positive (`z.number().int().positive()`, shared/ipc/ask.ts),
// so doubling them for the result half and adding one for the question half
// keeps both namespaces disjoint from each other AND from the single
// negative id reserved for the boundary marker below.
function resultEntryId(messageId: number): number {
  return messageId * 2
}

function questionEntryId(messageId: number): number {
  return messageId * 2 + 1
}

/**
 * Exported (validator #264 mandatory fix 2) so every other module that needs
 * to reason about the boundary entry's id — the container's local-id space,
 * their tests — reads the SAME literal instead of re-hardcoding `-1`.
 */
export const BOUNDARY_ENTRY_ID = -1

function toResultEntry(message: AskHistoryMessage): AskEntry {
  const { result } = message
  const id = resultEntryId(message.id)

  if (result.kind === 'answer') {
    return { kind: 'answer', id, text: result.answer, citations: result.citations }
  }
  if (result.kind === 'general') {
    return { kind: 'general', id, text: result.answer }
  }
  // `not-found` carries no model text — same as the live panel (design D6).
  return { kind: 'state', id, icon: SearchX, title: ASK_NOT_FOUND.title, detail: ASK_NOT_FOUND.detail }
}

export function toEntries(messages: readonly AskHistoryMessage[], window: TranscriptWindowMarker): AskEntry[] {
  const entries: AskEntry[] = []
  const boundary: AskEntry = { kind: 'boundary', id: BOUNDARY_ENTRY_ID }
  let boundaryPlaced = false

  for (const message of messages) {
    if (window.excludedCount > 0 && message.id === window.startMessageId) {
      entries.push(boundary)
      boundaryPlaced = true
    }
    entries.push({ kind: 'question', id: questionEntryId(message.id), text: message.question })
    entries.push(toResultEntry(message))
  }

  // Fallback (design D2's oversized-single-turn edge, AND validator #262's
  // mandatory fix 2 — the guard against `startMessageId` naming a message
  // absent from the list): whenever something was excluded but the loop
  // above never placed the marker — `startMessageId` is `null`, or it names
  // a message not in `messages` — it still has to land SOMEWHERE. Dropping
  // it silently is exactly what proposal Decision 6 forbids, so it goes
  // after the last message instead of disappearing.
  if (window.excludedCount > 0 && !boundaryPlaced) {
    entries.push(boundary)
  }

  return entries
}
