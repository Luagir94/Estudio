import { describe, expect, it } from 'vitest'
import { markdownDocumentFileName, markdownDocumentSeed } from './markdownDocument'

describe('markdownDocumentFileName', () => {
  it('slugifies the typed name and appends the markdown extension', () => {
    expect(markdownDocumentFileName('Resumen unidad 3')).toBe('resumen-unidad-3.md')
  })

  it('strips diacritics rather than dropping the letters that carry them', () => {
    expect(markdownDocumentFileName('Análisis matemático')).toBe('analisis-matematico.md')
  })

  it('collapses runs of punctuation and whitespace into a single separator', () => {
    expect(markdownDocumentFileName('  TP 1 —  entrega  final!! ')).toBe('tp-1-entrega-final.md')
  })

  it('falls back to a generic stem when the name slugifies to nothing', () => {
    expect(markdownDocumentFileName('¿¡...!?')).toBe('documento.md')
  })

  // The stem is capped well under `sanitizeFileName`'s 100-char limit so the
  // uuid prefix the service prepends can never push the stored name past it.
  it('caps a very long name', () => {
    const fileName = markdownDocumentFileName('a'.repeat(200))

    expect(fileName).toBe(`${'a'.repeat(60)}.md`)
  })
})

describe('markdownDocumentSeed', () => {
  // NOT empty, for the same reason `seedApunte` is not: the editor opens on
  // the document immediately, and a blank first line gives the student
  // nothing to write under.
  it('seeds the document with the typed name as its heading', () => {
    expect(markdownDocumentSeed('Resumen unidad 3')).toBe('# Resumen unidad 3\n\n')
  })

  it('keeps the name as typed, accents and casing included', () => {
    expect(markdownDocumentSeed('Análisis Matemático II')).toBe('# Análisis Matemático II\n\n')
  })
})
