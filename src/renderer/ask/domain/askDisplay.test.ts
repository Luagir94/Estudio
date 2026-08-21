import { describe, expect, it } from 'vitest'
import { askErrorCodeSchema } from '../../../shared/ipc/ask'
import { CLI_PROVIDERS, modelIdSchema } from '../../../shared/ipc/cli'
import {
  ASK_BASELINE_MODELS,
  ASK_COMPOSER_PLACEHOLDER,
  ASK_DISCLAIMER,
  ASK_MEMORY_BOUNDARY_MARKER,
  ASK_NEW_CONVERSATION_LABEL,
  ASK_NOT_FOUND,
  ASK_NOT_SAVED,
  ASK_PANEL_TITLE,
  ASK_PENDING,
  ASK_PROVIDER_LABEL,
  describeAskError
} from './askDisplay'

// Pure copy layer (design D7). The renderer owns EVERY user-facing string:
// main sends a typed code plus at most a technical detail, and nothing the
// model wrote is ever rendered as guidance. These tests pin that contract.
describe('describeAskError', () => {
  it('covers every code in the shared error union', () => {
    for (const code of askErrorCodeSchema.options) {
      const copy = describeAskError(code)
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.detail.length).toBeGreaterThan(0)
    }
  })

  it('gives each code its own distinct title, so no two failures read alike', () => {
    const titles = askErrorCodeSchema.options.map((code) => describeAskError(code).title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  // The names come from the app's own pre-spawn gate, never from the model.
  it('folds the offending file names into the OVERSIZED_ATTACHMENT detail', () => {
    const copy = describeAskError('OVERSIZED_ATTACHMENT', 'enorme.pdf, gigante.pdf')

    expect(copy.title).toBe('Hay archivos que superan los 32 MB')
    expect(copy.detail).toContain('enorme.pdf, gigante.pdf')
  })

  it('still reads sensibly when OVERSIZED_ATTACHMENT arrives without names', () => {
    const copy = describeAskError('OVERSIZED_ATTACHMENT')

    expect(copy.detail.length).toBeGreaterThan(0)
    expect(copy.detail).not.toContain('undefined')
  })

  // Documented, undetectable v1 limitation: a PDF under 32MB but over 100
  // pages fails inside the CLI. The copy has to name it as a possible cause,
  // because the app genuinely cannot tell the user which one it was.
  it('names the page-count limitation as a possible cause of EXECUTION_FAILED', () => {
    const copy = describeAskError('EXECUTION_FAILED')

    expect(copy.detail).toMatch(/páginas/i)
  })

  it('points the two degraded-CLI codes at Ajustes', () => {
    expect(describeAskError('CLI_NOT_FOUND').action).toBe('ajustes')
    expect(describeAskError('CLI_UNUSABLE').action).toBe('ajustes')
    expect(describeAskError('TIMEOUT').action).toBeUndefined()
  })

  // A raw process or model string reaching the screen is exactly what the
  // typed-error design exists to prevent.
  it('never surfaces the raw technical detail for codes that do not carry names', () => {
    const copy = describeAskError('EXECUTION_FAILED', 'Error: ENOENT spawn C:\\tools\\claude.exe')

    expect(copy.title).not.toContain('ENOENT')
    expect(copy.detail).not.toContain('ENOENT')
  })
})

describe('static copy', () => {
  it('states the not-found outcome in the app\u2019s own words', () => {
    expect(ASK_NOT_FOUND.title).toBe('No encontré eso en tu cursada.')
    expect(ASK_NOT_FOUND.detail).toBe(
      'Probá reformular la pregunta, o revisá si eso está cargado en la app o subido como archivo.'
    )
  })

  it('carries the cost disclaimer verbatim', () => {
    expect(ASK_DISCLAIMER).toBe('Esta función usa tu propio uso de Claude')
  })

  // The three "cursada" constants (design #273 §2) move together or not at
  // all: the corpus is the whole cursada — files on disk AND the app's own
  // rows (`materias, horario, entregas, finales, carreras`) — so "materiales"
  // named only half of it and promised the user less than the panel does.
  // "Mi Cursada" is already the app's own word for that scope (`Sidebar.tsx`).
  // Pinned verbatim, ellipsis is the single character U+2026.
  it('names the whole cursada in the panel title, asking *about* it rather than *to* it', () => {
    expect(ASK_PANEL_TITLE).toBe('Preguntar sobre mi cursada')
  })

  it('carries the composer placeholder', () => {
    expect(ASK_COMPOSER_PLACEHOLDER).toBe('Preguntá sobre tu cursada…')
  })

  it('says it is searching the whole cursada while a question is in flight', () => {
    expect(ASK_PENDING.title).toBe('Buscando en tu cursada…')
  })

  // Per-turn write-failure honesty (design D1/D6): the answer renders, but
  // the user must also learn it was NOT saved — same trust standard the
  // memory-boundary marker holds for silent forgetting. Pinned verbatim
  // against the approved `.pen` (obs #268 §2), like its ASK_NOT_FOUND/
  // ASK_DISCLAIMER/ASK_COMPOSER_PLACEHOLDER siblings.
  it('states the not-saved write failure in the app’s own words', () => {
    expect(ASK_NOT_SAVED).toBe('Esta respuesta no se guardó en el historial')
  })

  // Memory-boundary copy (design #268 §1) — pinned verbatim, distinct from
  // the amber not-saved pill: this one is neutral information, not a warning.
  it('states the memory-boundary marker in the app’s own words', () => {
    expect(ASK_MEMORY_BOUNDARY_MARKER).toBe('El modelo ya no ve los mensajes anteriores a esta línea')
  })

  // The history list's new-thread action (design #268 §3, node `L0zOG`) —
  // two spaces after the plus, pinned verbatim.
  it('carries the new-conversation label verbatim, two spaces after the plus', () => {
    expect(ASK_NEW_CONVERSATION_LABEL).toBe('+  Conversación nueva')
  })
})

// The floor that keeps the picker usable on a machine where nothing has been
// discovered — and, for Antigravity, the ONLY route into the menu at all: agy
// publishes its models through a `models` subcommand nothing here reads.
describe('ASK_BASELINE_MODELS', () => {
  // A baseline the picker offers but the spawn boundary then refuses is the one
  // failure mode worse than not offering the model at all, so every id here
  // crosses the SAME gate `askService` re-asserts before it spawns.
  it.each(ASK_BASELINE_MODELS)('offers $modelId in a shape the spawn gate accepts', (selection) => {
    expect(modelIdSchema.parse(selection.modelId)).toBe(selection.modelId)
  })

  it.each(ASK_BASELINE_MODELS)('offers $modelId under a CLI this build enables', (selection) => {
    expect(CLI_PROVIDERS).toContain(selection.provider)
  })

  // Discovery is additive everywhere else; here it is absent by design, so a
  // missing baseline would leave the CLI connected in Ajustes and invisible in
  // the panel.
  it('names at least one model for the CLI that has no discovery source', () => {
    expect(ASK_BASELINE_MODELS.filter((entry) => entry.provider === 'antigravity').length).toBeGreaterThan(0)
  })
})

describe('ASK_PROVIDER_LABEL', () => {
  // The menu heading for a CLI with no label would render as `undefined` over
  // a section the student is about to spend their own quota from.
  it.each(CLI_PROVIDERS)('names %s in the app own words', (provider) => {
    expect(ASK_PROVIDER_LABEL[provider].length).toBeGreaterThan(0)
  })

  it('calls the new provider by its product name', () => {
    expect(ASK_PROVIDER_LABEL.antigravity).toBe('Antigravity CLI')
  })
})
