import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SPREADSHEET_SOURCE_BYTES } from '../../domain/limits'
import { extractSpreadsheetText } from './spreadsheetExtractor'

/** exceljs is already an approved runtime dependency for THIS extractor, so it doubles as the fixture writer — a genuine round trip, zero extra dependencies, no committed binary. */
async function writeMinimalXlsx(filePath: string, rows: readonly (readonly (string | number)[])[]): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Hoja1')
  for (const row of rows) {
    worksheet.addRow([...row])
  }
  await workbook.xlsx.writeFile(filePath)
}

describe('extractSpreadsheetText', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spreadsheet-extractor-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('extracts cell text from a well-formed XLSX (spec: Supported format extracts)', async () => {
    const filePath = path.join(tmpDir, 'calificaciones.xlsx')
    await writeMinimalXlsx(filePath, [
      ['nombre', 'nota'],
      ['Ana', 9]
    ])

    const text = await extractSpreadsheetText(filePath)

    expect(text).toContain('nombre')
    expect(text).toContain('Ana')
    expect(text).toContain('9')
  })

  it('extracts different content from a different fixture (triangulation)', async () => {
    const filePath = path.join(tmpDir, 'otro.xlsx')
    await writeMinimalXlsx(filePath, [['materia', 'algebra lineal']])

    const text = await extractSpreadsheetText(filePath)

    expect(text).toContain('algebra lineal')
    expect(text).not.toContain('Ana')
  })

  it('skips an XLSX at or over the 10 MiB cap WITHOUT parsing it (spec: Oversized XLSX/CSV capped)', async () => {
    const filePath = path.join(tmpDir, 'enorme.xlsx')
    const statMock = vi.fn().mockResolvedValue({ size: MAX_SPREADSHEET_SOURCE_BYTES })

    const text = await extractSpreadsheetText(filePath, { stat: statMock })

    expect(text).toBe('')
    expect(statMock).toHaveBeenCalledWith(filePath)
  })

  it('throws when the file is not a valid XLSX (spec: Corrupt file fails gracefully — extractor surfaces the error, caller maps it to not-indexable)', async () => {
    const filePath = path.join(tmpDir, 'corrupto.xlsx')
    await fs.writeFile(filePath, Buffer.from('this is not an xlsx at all, just plain bytes'))

    await expect(extractSpreadsheetText(filePath)).rejects.toThrow()
  })
})
