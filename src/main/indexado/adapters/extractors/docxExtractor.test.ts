import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMinimalDocx } from './__fixtures__/buildMinimalDocx'
import { extractDocxText } from './docxExtractor'

describe('extractDocxText', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-extractor-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts the paragraph text from a well-formed DOCX (spec: Supported format extracts)', async () => {
    const filePath = path.join(tmpDir, 'trabajo-practico.docx')
    await fs.writeFile(filePath, buildMinimalDocx('Hello World'))

    const text = await extractDocxText(filePath)

    expect(text).toContain('Hello World')
  })

  it('extracts different content from a different fixture (triangulation)', async () => {
    const filePath = path.join(tmpDir, 'otro.docx')
    await fs.writeFile(filePath, buildMinimalDocx('Resumen de Algebra Lineal'))

    const text = await extractDocxText(filePath)

    expect(text).toContain('Resumen de Algebra Lineal')
    expect(text).not.toContain('Hello World')
  })

  it('throws when the file is not a valid DOCX/ZIP (spec: Corrupt file fails gracefully — extractor surfaces the error, caller maps it to not-indexable)', async () => {
    const filePath = path.join(tmpDir, 'corrupto.docx')
    await fs.writeFile(filePath, Buffer.from('this is not a docx at all, just plain bytes'))

    await expect(extractDocxText(filePath)).rejects.toThrow()
  })
})
