import fs from 'node:fs/promises'
// pdf-parse's package root (`pdf-parse/index.js`) runs a top-level
// "debug mode" check that, outside a normal `module.parent` context (e.g.
// under Vitest/ESM), tries to synchronously read a fixture PDF shipped
// inside its OWN package directory — throwing ENOENT here instead. The
// internal `lib/pdf-parse.js` path is the real parser with no such shim
// (design "Technical Approach": "pdf-parse via internal
// `pdf-parse/lib/pdf-parse.js` path to dodge the entry gotcha").
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { ExtractedPage } from '../../domain/extractionDispatcher'

/**
 * The slice of pdf.js's page proxy the per-page renderer reads. pdf-parse
 * hands each page to the `pagerender` option; `transform[5]` is the glyph
 * run's Y coordinate, which is what the default renderer keys line breaks on.
 */
interface PdfPageData {
  getTextContent(options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<{
    items: readonly { str: string; transform: readonly number[] }[]
  }>
}

/**
 * Extracts the text layer of a PDF file page by page (spec "Format dispatch
 * and size cap": "Supported format extracts"; page-number citations: page
 * identity must survive extraction). Entries are 1-based and in document
 * order — pdf-parse invokes `pagerender` sequentially, awaiting each page
 * before requesting the next, so array position IS the page number.
 *
 * A scanned/image-only PDF with no text layer resolves successfully with
 * every page's text empty — extraction "failing silently" into emptiness is
 * a normal outcome, not an error. A malformed PDF that pdf-parse cannot open
 * at all REJECTS; the caller (indexadoService, slice 2b) is the extraction
 * boundary that catches that and maps it to `not-indexable` (spec "Corrupt
 * file fails gracefully").
 */
export async function extractPdfPages(filePath: string): Promise<ExtractedPage[]> {
  const buffer = await fs.readFile(filePath)
  return withoutBufferPooling(async () => {
    const pageTexts: string[] = []
    await pdfParse(buffer, {
      pagerender: async (pageData: PdfPageData): Promise<string> => {
        const text = await renderPageText(pageData)
        pageTexts.push(text)
        return text
      }
    })
    return pageTexts.map((text, index) => ({ page: index + 1, text }))
  })
}

/**
 * Reimplements pdf-parse's default `render_page` verbatim (same
 * `getTextContent` options, same Y-coordinate line-break heuristic) so
 * per-page collection changes WHERE the text lands, never WHAT it says —
 * the extracted bytes for any one page match what the flat default would
 * have contributed for that page.
 */
async function renderPageText(pageData: PdfPageData): Promise<string> {
  const textContent = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
  let lastY: number | undefined
  let text = ''
  for (const item of textContent.items) {
    const y = item.transform[5]
    if (lastY === y || lastY === undefined) {
      text += item.str
    } else {
      text += `\n${item.str}`
    }
    lastY = y
  }
  return text
}

/**
 * `pdf-parse@1.1.4`'s vendored pdf.js (v1.10.100) re-reads its input through
 * an internal Node-specific stream path that allocates from Node's shared
 * Buffer pool, then builds its cross-reference substream via `bytes.buffer`
 * — the raw underlying `ArrayBuffer` — while treating xref offsets as if
 * they were 0-indexed from that buffer's start. Whenever the pooled
 * allocation lands at a NONZERO `byteOffset` (routine for small files),
 * pdf.js reads from the wrong position and throws "bad XRef entry" on an
 * otherwise perfectly valid PDF (confirmed empirically: identical bytes
 * parse successfully once pooling is disabled). Zeroing `Buffer.poolSize`
 * for the duration of the call forces every allocation involved — ours and
 * pdf-parse's internal ones — to be a dedicated, byteOffset-0 buffer, then
 * restores the original pool size immediately after (even on rejection) so
 * unrelated code elsewhere in the process keeps using the pool normally.
 */
async function withoutBufferPooling<T>(run: () => Promise<T>): Promise<T> {
  const originalPoolSize = Buffer.poolSize
  Buffer.poolSize = 0
  try {
    return await run()
  } finally {
    Buffer.poolSize = originalPoolSize
  }
}
