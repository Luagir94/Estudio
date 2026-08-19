import { describe, expect, it } from 'vitest'
import {
  formatAddFailureDetail,
  formatAddFailureSummary,
  formatAttachmentDate,
  formatAttachmentMeta,
  formatAttachmentSize,
  getFileExtension,
  resolveAttachmentKind
} from './attachmentDisplay'

describe('getFileExtension', () => {
  it('returns the uppercased extension for a normal file name', () => {
    expect(getFileExtension('apuntes.pdf')).toBe('PDF')
  })

  it('returns an empty string when there is no extension', () => {
    expect(getFileExtension('README')).toBe('')
  })
})

describe('resolveAttachmentKind', () => {
  it('classifies known image extensions as image', () => {
    expect(resolveAttachmentKind('foto.jpg')).toBe('image')
    expect(resolveAttachmentKind('foto.PNG')).toBe('image')
  })

  it('classifies everything else as document', () => {
    expect(resolveAttachmentKind('apuntes.docx')).toBe('document')
    expect(resolveAttachmentKind('sin-extension')).toBe('document')
  })
})

describe('formatAttachmentSize', () => {
  it('formats bytes as MB with a Spanish decimal comma', () => {
    expect(formatAttachmentSize(2_516_582)).toBe('2,4 MB')
  })

  it('rounds to exactly one decimal', () => {
    expect(formatAttachmentSize(1_048_576)).toBe('1,0 MB')
  })
})

describe('formatAttachmentDate', () => {
  it('formats a local-naive createdAt as day + short Spanish month', () => {
    expect(formatAttachmentDate('2026-08-12T10:00')).toBe('12 ago')
  })

  it('formats a different month correctly (not a hardcoded single case)', () => {
    expect(formatAttachmentDate('2026-01-03T09:30')).toBe('3 ene')
  })
})

describe('formatAttachmentMeta', () => {
  it('joins size and date with a middle dot', () => {
    expect(formatAttachmentMeta(2_516_582, '2026-08-12T10:00')).toBe('2,4 MB · 12 ago')
  })
})

describe('formatAddFailureSummary', () => {
  it('formats the exact designed copy for one failure out of several files', () => {
    expect(formatAddFailureSummary(1, 3)).toBe('1 de 3 archivos no se agregó')
  })

  it('pluralizes both the verb and "archivo" when every attempted file failed', () => {
    expect(formatAddFailureSummary(2, 2)).toBe('2 de 2 archivos no se agregaron')
  })

  it('keeps "archivo" singular when only one file was attempted', () => {
    expect(formatAddFailureSummary(1, 1)).toBe('1 de 1 archivo no se agregó')
  })
})

describe('formatAddFailureDetail', () => {
  it('builds the size-cap detail line from the real file name, not a hardcoded string', () => {
    expect(formatAddFailureDetail({ fileName: 'Clase 4.mp4', code: 'FILE_TOO_LARGE', message: 'irrelevant' })).toBe(
      'Clase 4.mp4 supera el límite de 250 MB'
    )
    expect(formatAddFailureDetail({ fileName: 'video.mov', code: 'FILE_TOO_LARGE', message: 'irrelevant' })).toBe(
      'video.mov supera el límite de 250 MB'
    )
  })

  it('builds a generic copy-failure detail line', () => {
    expect(formatAddFailureDetail({ fileName: 'notas.txt', code: 'COPY_FAILED', message: 'irrelevant' })).toBe(
      'notas.txt no se pudo copiar'
    )
  })
})
