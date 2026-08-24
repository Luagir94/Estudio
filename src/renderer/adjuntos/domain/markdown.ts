// Pure, framework-free markdown block parser for the in-app viewer
// (markdown-attachment-viewer — approved design "Vista" mode). Deliberately
// in-house and SMALL: it covers exactly the syntax the design renders
// (#/##/### headings, paragraphs, -/* lists, > blockquotes, ``` fences, and
// **bold** / *italic* / _italic_ / `code` / ~~strikethrough~~ inline spans)
// and DEGRADES everything else to plain text. It returns TYPED blocks and
// spans, never html strings — the presentational layer maps them to JSX, so
// no dangerouslySetInnerHTML exists anywhere downstream.
export type InlineSpan =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strikethrough'; text: string }

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'list'; items: InlineSpan[][] }
  | { type: 'blockquote'; spans: InlineSpan[] }
  | { type: 'code-block'; language: string | null; content: string }

interface InlineMarker {
  token: string
  type: Exclude<InlineSpan['type'], 'text'>
}

// Two-character tokens first — `**` must win over `*` at the same position.
const INLINE_MARKERS: InlineMarker[] = [
  { token: '**', type: 'bold' },
  { token: '~~', type: 'strikethrough' },
  { token: '`', type: 'code' },
  { token: '*', type: 'italic' },
  { token: '_', type: 'italic' }
]

/**
 * First-closer-wins scanner. Inner content is NOT recursively parsed —
 * nested markers stay literal inside the outer span, which is the "degrade,
 * never throw" contract. Emphasis whose inner text starts/ends with a space
 * stays literal too (`2 * 3 * 4` is arithmetic, not italics); inline code is
 * exempt from that rule because its content is verbatim by definition.
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let buffer = ''
  let i = 0

  function flushText(): void {
    if (buffer.length > 0) {
      spans.push({ type: 'text', text: buffer })
      buffer = ''
    }
  }

  while (i < text.length) {
    const marker = INLINE_MARKERS.find((candidate) => text.startsWith(candidate.token, i))
    if (marker) {
      const closeAt = text.indexOf(marker.token, i + marker.token.length)
      const inner = closeAt === -1 ? '' : text.slice(i + marker.token.length, closeAt)
      const innerIsLegal = inner.length > 0 && (marker.type === 'code' || inner === inner.trim())
      if (closeAt !== -1 && innerIsLegal) {
        flushText()
        spans.push({ type: marker.type, text: inner })
        i = closeAt + marker.token.length
        continue
      }
    }
    buffer += text[i]
    i += 1
  }

  flushText()
  return spans
}

const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/
const LIST_ITEM_PATTERN = /^\s*[-*]\s+(.*)$/
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraphLines: string[] = []
  let listItems: InlineSpan[][] = []
  let quoteLines: string[] = []

  function flushParagraph(): void {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', spans: parseInline(paragraphLines.join(' ')) })
      paragraphLines = []
    }
  }

  function flushList(): void {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  function flushQuote(): void {
    if (quoteLines.length > 0) {
      blocks.push({ type: 'blockquote', spans: parseInline(quoteLines.join(' ').trim()) })
      quoteLines = []
    }
  }

  function flushAll(): void {
    flushParagraph()
    flushList()
    flushQuote()
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i += 1
      continue
    }
    const trimmed = line.trim()

    // Fenced code first — everything inside is VERBATIM, so no other rule
    // may look at those lines. An unterminated fence swallows the rest of
    // the document (degrade, never throw).
    if (trimmed.startsWith('```')) {
      flushAll()
      const language = trimmed.slice(3).trim() || null
      const contentLines: string[] = []
      i += 1
      while (i < lines.length && lines[i]!.trim() !== '```') {
        contentLines.push(lines[i]!)
        i += 1
      }
      // Skip the closing fence when there is one.
      i += 1
      blocks.push({ type: 'code-block', language, content: contentLines.join('\n') })
      continue
    }

    const headingMatch = HEADING_PATTERN.exec(trimmed)
    if (headingMatch) {
      flushAll()
      blocks.push({
        type: 'heading',
        level: headingMatch[1]!.length as 1 | 2 | 3,
        spans: parseInline(headingMatch[2]!.trim())
      })
      i += 1
      continue
    }

    if (trimmed === '') {
      flushAll()
      i += 1
      continue
    }

    const listMatch = LIST_ITEM_PATTERN.exec(line)
    if (listMatch) {
      flushParagraph()
      flushQuote()
      listItems.push(parseInline(listMatch[1]!.trim()))
      i += 1
      continue
    }

    const quoteMatch = BLOCKQUOTE_PATTERN.exec(trimmed)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      quoteLines.push(quoteMatch[1]!.trim())
      i += 1
      continue
    }

    // Anything else — including syntax outside the covered set, like a
    // 4-hash heading — is a plain paragraph line.
    flushList()
    flushQuote()
    paragraphLines.push(trimmed)
    i += 1
  }

  flushAll()
  return blocks
}
