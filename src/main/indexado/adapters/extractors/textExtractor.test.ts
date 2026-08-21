import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SPREADSHEET_SOURCE_BYTES } from '../../domain/limits'
import { extractTextFileText } from './textExtractor'

describe('extractTextFileText', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'text-extractor-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('reads a TXT file verbatim (spec: Supported format extracts)', async () => {
    const filePath = path.join(tmpDir, 'notas.txt')
    await fs.writeFile(filePath, 'apuntes de la clase de hoy')

    expect(await extractTextFileText(filePath)).toBe('apuntes de la clase de hoy')
  })

  it('reads an MD file verbatim', async () => {
    const filePath = path.join(tmpDir, 'readme.md')
    await fs.writeFile(filePath, '# Titulo\n\nContenido del resumen')

    expect(await extractTextFileText(filePath)).toBe('# Titulo\n\nContenido del resumen')
  })

  it('reads a CSV file verbatim when under the size cap (triangulation)', async () => {
    const filePath = path.join(tmpDir, 'planilla.csv')
    await fs.writeFile(filePath, 'nombre,nota\nAna,9\nLuis,7')

    expect(await extractTextFileText(filePath)).toBe('nombre,nota\nAna,9\nLuis,7')
  })

  it('skips a CSV at or over the 10 MiB cap WITHOUT reading its content (spec: XLSX/CSV size cap)', async () => {
    const filePath = path.join(tmpDir, 'enorme.csv')
    const readFile = vi.fn()
    const fsSubset = {
      stat: vi.fn().mockResolvedValue({ size: MAX_SPREADSHEET_SOURCE_BYTES }),
      readFile
    }

    const text = await extractTextFileText(filePath, fsSubset)

    expect(text).toBe('')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('does NOT apply the size cap to TXT/MD — only XLSX/CSV are capped per spec', async () => {
    const filePath = path.join(tmpDir, 'grande.txt')
    const fsSubset = {
      stat: vi.fn().mockResolvedValue({ size: MAX_SPREADSHEET_SOURCE_BYTES }),
      readFile: vi.fn().mockResolvedValue('contenido largo')
    }

    const text = await extractTextFileText(filePath, fsSubset)

    expect(text).toBe('contenido largo')
    expect(fsSubset.stat).not.toHaveBeenCalled()
  })
})
