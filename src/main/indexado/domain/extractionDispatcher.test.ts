import { describe, expect, it } from 'vitest'
import { detectExtractionFormat } from './extractionDispatcher'

describe('detectExtractionFormat', () => {
  it('maps a PDF file name to the "pdf" format (spec: Supported format extracts)', () => {
    expect(detectExtractionFormat('apuntes.pdf')).toBe('pdf')
  })

  it('maps a DOCX file name to the "docx" format', () => {
    expect(detectExtractionFormat('trabajo-practico.docx')).toBe('docx')
  })

  it('maps TXT, MD, and CSV file names to the "text" format', () => {
    expect(detectExtractionFormat('notas.txt')).toBe('text')
    expect(detectExtractionFormat('readme.md')).toBe('text')
    expect(detectExtractionFormat('planilla.csv')).toBe('text')
  })

  it('maps an XLSX file name to the "spreadsheet" format', () => {
    expect(detectExtractionFormat('calificaciones.xlsx')).toBe('spreadsheet')
  })

  it('returns null for an unsupported extension without attempting extraction (spec: Unsupported extension skipped)', () => {
    expect(detectExtractionFormat('foto.png')).toBeNull()
  })

  it('returns null for a file name with no extension at all', () => {
    expect(detectExtractionFormat('README')).toBeNull()
  })

  it('is case-insensitive on the extension', () => {
    expect(detectExtractionFormat('ESCANEO.PDF')).toBe('pdf')
  })
})
