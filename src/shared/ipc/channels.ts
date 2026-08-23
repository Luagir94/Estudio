// Deliberately dependency-free (no zod, no anything) — the sandboxed
// preload process (`sandbox: true`, design §7) can only `require()` Node.js
// builtins and whatever the bundler inlines; every OTHER `shared/ipc/*`
// module imports `zod` at module scope, and importing a runtime VALUE
// (not just a `type`) from one of those into preload pulls `zod` into the
// preload bundle, where it fails with "module not found: zod" — the
// sandboxed preload has no node_modules resolution. Preload has always
// imported ONLY `type`s from `shared/ipc/*` (erased at compile time); this
// file exists so a real runtime constant (the push-event channel name) can
// be shared with preload without breaking that invariant.
export const MENU_EXPORT_REQUESTED_CHANNEL = 'menu:export-requested'

// Same zod-free-module requirement as above: main pushes this event
// whenever a background indexing job finishes (attachment-fts-index design
// "Renderer notify" — precedent: `MENU_EXPORT_REQUESTED_CHANNEL`), and the
// sandboxed preload bundle must be able to `require()` the constant without
// pulling `zod` in through `shared/ipc/indexado.ts`.
export const INDEXADO_STATUS_CHANGED_CHANNEL = 'indexado:status-changed'

// Markdown viewer/editor channels (markdown-attachment-viewer). Same
// zod-free-module requirement as above: preload needs the runtime channel
// NAME for its `ipcRenderer.invoke` forwarders, and it must come from here —
// a runtime import from `shared/ipc/adjuntos.ts` would pull `zod` into the
// sandboxed preload bundle.
export const ADJUNTOS_READ_CHANNEL = 'adjuntos:read'
export const ADJUNTOS_WRITE_CHANNEL = 'adjuntos:write'
