import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMinimalPdf } from './__fixtures__/buildMinimalPdf'
import { extractPdfText } from './pdfExtractor'

describe('extractPdfText', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-extractor-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts the text layer from a well-formed PDF (spec: Supported format extracts)', async () => {
    const filePath = path.join(tmpDir, 'apuntes.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ text: 'Hello World' }))

    const text = await extractPdfText(filePath)

    expect(text).toContain('Hello World')
  })

  it('extracts different content from a different fixture (triangulation)', async () => {
    const filePath = path.join(tmpDir, 'otro.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ text: 'Algebra Lineal' }))

    const text = await extractPdfText(filePath)

    expect(text).toContain('Algebra Lineal')
    expect(text).not.toContain('Hello World')
  })

  it('returns empty text for a scanned/image-only PDF with no extractable text layer (not-indexable path)', async () => {
    const filePath = path.join(tmpDir, 'escaneo.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ text: null }))

    const text = await extractPdfText(filePath)

    expect(text.trim()).toBe('')
  })

  it('throws when the file is not a valid PDF (spec: Corrupt file fails gracefully — extractor surfaces the error, caller maps it to not-indexable)', async () => {
    const filePath = path.join(tmpDir, 'corrupto.pdf')
    await fs.writeFile(filePath, Buffer.from('this is not a pdf at all, just plain bytes'))

    await expect(extractPdfText(filePath)).rejects.toThrow()
  })
})
