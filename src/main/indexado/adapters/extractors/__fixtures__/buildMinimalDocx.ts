import { buildMinimalZip } from './buildMinimalZip'

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDocumentXml(paragraphText: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${escapeXmlText(paragraphText)}</w:t></w:r></w:p>
  </w:body>
</w:document>`
}

/**
 * A minimal but genuinely valid OOXML `.docx` (a ZIP with exactly the three
 * parts a package needs: content types, root relationships, and the main
 * document part) — generated at test-setup time via `buildMinimalZip`
 * instead of committing an opaque binary fixture.
 */
export function buildMinimalDocx(paragraphText: string): Buffer {
  return buildMinimalZip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
    { name: '_rels/.rels', content: ROOT_RELS_XML },
    { name: 'word/document.xml', content: buildDocumentXml(paragraphText) }
  ])
}
