import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMinimalPdf } from './__fixtures__/buildMinimalPdf'
import { extractPdfPages } from './pdfExtractor'

describe('extractPdfPages', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-extractor-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts the text layer of a single-page PDF as one page entry (spec: Supported format extracts)', async () => {
    const filePath = path.join(tmpDir, 'apuntes.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ text: 'Hello World' }))

    const pages = await extractPdfPages(filePath)

    expect(pages).toHaveLength(1)
    expect(pages[0]?.page).toBe(1)
    expect(pages[0]?.text).toContain('Hello World')
  })

  // The whole point of the page-number-citations change: page identity must
  // survive extraction, so each page's text arrives as its OWN entry with a
  // 1-based page number in document order.
  it('extracts a multi-page PDF as one entry per page, 1-based, in document order', async () => {
    const filePath = path.join(tmpDir, 'libro.pdf')
    await fs.writeFile(
      filePath,
      buildMinimalPdf({ pages: ['Contenido de la primera pagina', 'Contenido de la segunda pagina', 'Tercera'] })
    )

    const pages = await extractPdfPages(filePath)

    expect(pages).toHaveLength(3)
    expect(pages.map((entry) => entry.page)).toEqual([1, 2, 3])
    expect(pages[0]?.text).toContain('Contenido de la primera pagina')
    expect(pages[0]?.text).not.toContain('segunda')
    expect(pages[1]?.text).toContain('Contenido de la segunda pagina')
    expect(pages[1]?.text).not.toContain('primera')
    expect(pages[2]?.text).toContain('Tercera')
  })

  it('extracts different content from a different fixture (triangulation)', async () => {
    const filePath = path.join(tmpDir, 'otro.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ text: 'Algebra Lineal' }))

    const pages = await extractPdfPages(filePath)

    expect(pages[0]?.text).toContain('Algebra Lineal')
    expect(pages[0]?.text).not.toContain('Hello World')
  })

  it('yields only empty-text pages for a scanned/image-only PDF with no extractable text layer (not-indexable path)', async () => {
    const filePath = path.join(tmpDir, 'escaneo.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ pages: [null, null] }))

    const pages = await extractPdfPages(filePath)

    expect(pages).toHaveLength(2)
    expect(pages.every((entry) => entry.text.trim() === '')).toBe(true)
  })

  // A mixed document (scanned cover, real text after it) must keep the REAL
  // page numbers — page 2's text is tagged 2, never renumbered to 1.
  it('keeps the true page number for text pages that follow an empty page', async () => {
    const filePath = path.join(tmpDir, 'mixto.pdf')
    await fs.writeFile(filePath, buildMinimalPdf({ pages: [null, 'Texto en la segunda pagina'] }))

    const pages = await extractPdfPages(filePath)

    expect(pages).toHaveLength(2)
    expect(pages[0]?.text.trim()).toBe('')
    expect(pages[1]?.page).toBe(2)
    expect(pages[1]?.text).toContain('Texto en la segunda pagina')
  })

  it('throws when the file is not a valid PDF (spec: Corrupt file fails gracefully — extractor surfaces the error, caller maps it to not-indexable)', async () => {
    const filePath = path.join(tmpDir, 'corrupto.pdf')
    await fs.writeFile(filePath, Buffer.from('this is not a pdf at all, just plain bytes'))

    await expect(extractPdfPages(filePath)).rejects.toThrow()
  })
})
