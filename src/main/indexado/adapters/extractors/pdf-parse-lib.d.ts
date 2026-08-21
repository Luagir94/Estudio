// Ambient declaration for pdf-parse's internal module path (see
// `pdfExtractor.ts` for why the internal path is imported instead of the
// package root). pdf-parse@1.1.4 ships no `.d.ts` of its own and predates a
// package.json `exports` map, so TypeScript has nothing to resolve this
// subpath against without a local declaration.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string | null
  }

  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>

  export default pdfParse
}
