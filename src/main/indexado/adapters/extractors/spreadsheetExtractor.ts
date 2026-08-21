import * as nodeFs from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { MAX_SPREADSHEET_SOURCE_BYTES } from '../../domain/limits'

/** Narrow injectable fs subset (same convention as `fileAttachmentStorage.ts`'s `AttachmentFsSubset`) — only `stat` is needed here, so the oversized-file test can mock it without writing a real 10 MiB fixture file. */
export interface SpreadsheetExtractorFsSubset {
  stat(filePath: string): Promise<{ size: number }>
}

/**
 * Extracts every populated cell's text from an XLSX file, one line per row
 * (spec "Format dispatch and size cap": "Supported format extracts"). Files
 * at or over the 10 MiB cap resolve to an empty string WITHOUT ever calling
 * `workbook.xlsx.readFile` (spec: "Oversized XLSX/CSV capped ... without
 * parsing"). A malformed XLSX rejects; the caller (indexadoService, slice
 * 2b) is the extraction boundary that catches that and maps it to
 * `not-indexable` (spec "Corrupt file fails gracefully").
 */
export async function extractSpreadsheetText(
  filePath: string,
  fs: SpreadsheetExtractorFsSubset = nodeFs
): Promise<string> {
  const stats = await fs.stat(filePath)
  if (stats.size >= MAX_SPREADSHEET_SOURCE_BYTES) {
    return ''
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const lines: string[] = []
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      const cellTexts: string[] = []
      row.eachCell((cell) => {
        cellTexts.push(cellValueToText(cell.value))
      })
      if (cellTexts.length > 0) {
        lines.push(cellTexts.join(' '))
      }
    })
  })

  return lines.join('\n')
}

/** Renders one ExcelJS cell value as plain text — covers the common scalar cases plus rich text and formula results, which come back as objects rather than primitives. */
function cellValueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((run) => run.text).join('')
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
    if ('result' in value && value.result !== undefined) {
      return String(value.result)
    }
    return ''
  }
  return String(value)
}
