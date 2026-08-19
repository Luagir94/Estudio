import { modelSelectionSchema, type ModelSelection } from '../../../shared/ipc/cli'

// Which model to ask with is a PREFERENCE, not screen state: you pick it once
// and expect the next question to use it. Same reasoning and same storage as
// `sidebarPreference` — it describes this window, not the user's academic
// data, so it does not belong in the SQLite store or the JSON export.
// Bumped from `ask:model` when the stored value grew from a bare key to a
// provider+model pair. A new key rather than a migration: the old value cannot
// be read as the new shape, and silently reinterpreting it would be a guess
// about which CLI the user meant.
const STORAGE_KEY = 'ask:selection'

export const ASK_DEFAULT_MODEL: ModelSelection = { provider: 'claude', modelId: 'claude-sonnet-5' }

/**
 * Reads the stored choice. Anything unrecognized answers the default rather
 * than propagating: storage can hold a value from an older build, or a model
 * id the account no longer has, and booting into an invalid selection would
 * fail at spawn time instead of here.
 *
 * The parse is the SAME `modelSelectionSchema` the IPC boundary uses, so a
 * hand-edited localStorage value cannot put a character in front of the spawn
 * boundary that the wire itself would have rejected.
 */
export function readAskModel(): ModelSelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return ASK_DEFAULT_MODEL
    const parsed = modelSelectionSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : ASK_DEFAULT_MODEL
  } catch {
    return ASK_DEFAULT_MODEL
  }
}

/** Persists the choice. A storage failure is not worth crashing a render over. */
export function writeAskModel(selection: ModelSelection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Ignored on purpose: the app works fine with an unpersisted preference.
  }
}
