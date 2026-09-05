// The three sections the Ajustes screen is split into (approved `.pen`, node
// `PQXon` "Section Tabs", frame "Grupo — Ajustes").
//
// The screen used to be ONE column 1618px tall — two full viewports of
// stacked cards, mixing appearance, CLI connections and MCP grants. Splitting
// it is not decoration: each section now fits a viewport without scrolling,
// and the three topics stop pretending to be one list.
//
// The order is the design's own and it is load-bearing: `apariencia` is the
// harmless one and comes first, `permisos` is the one that hands another
// process write access to the student's records and comes last. Nobody lands
// on grants by accident.
export const AJUSTES_SECTIONS = ['apariencia', 'integraciones', 'permisos'] as const

export type AjustesSection = (typeof AJUSTES_SECTIONS)[number]

/** The section the screen opens on. First in the design's order, and the one that can spawn nothing. */
export const DEFAULT_AJUSTES_SECTION: AjustesSection = 'apariencia'
