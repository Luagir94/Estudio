// Hand-built minimal valid PDF, generated at test-setup time instead of
// committing an opaque binary fixture (byte-accurate xref offsets are
// computed here, not hard-coded). A `null` page text produces a page with an
// EMPTY content stream — no `Tj` text-showing operator at all — which is
// what a scanned/image-only PDF looks like to a text extractor: structurally
// valid, zero extractable text (spec "Graceful degradation" /
// pdfExtractor.test.ts's not-indexable-path case). `{ text }` builds the
// original single-page shape; `{ pages }` builds one page per entry in
// document order (page-number citations need a 2+ page fixture).
function escapePdfLiteralString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function buildMinimalPdf(input: { text: string | null } | { pages: readonly (string | null)[] }): Buffer {
  const pageTexts = 'pages' in input ? input.pages : [input.text]

  // Object layout: 1 = catalog, 2 = pages, 3 = font (shared), then per page
  // N (0-based): page object at 4 + 2N, its content stream at 5 + 2N.
  const kids = pageTexts.map((_, index) => `${4 + index * 2} 0 R`).join(' ')
  const objectBodies: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]

  pageTexts.forEach((text, index) => {
    const content = text === null ? '' : `BT /F1 24 Tf 20 100 Td (${escapePdfLiteralString(text)}) Tj ET`
    objectBodies.push(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 200 200] /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`
    )
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objectBodies.forEach((body, index) => {
    const objectNumber = index + 1
    offsets[objectNumber] = Buffer.byteLength(pdf, 'utf8')
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  const objectCount = objectBodies.length + 1 // +1 for the free-list head entry
  pdf += `xref\n0 ${objectCount}\n`
  pdf += '0000000000 65535 f \n'
  for (let objectNumber = 1; objectNumber < objectCount; objectNumber += 1) {
    // Each line MUST be exactly 20 bytes per the PDF spec: 10-digit offset +
    // space + 5-digit generation + space + flag + space + CRLF.
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'utf8')
}
