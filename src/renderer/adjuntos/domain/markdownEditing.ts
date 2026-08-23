// Pure toolbar/editing helpers for the markdown editor (markdown-attachment-
// viewer design — Edición mode). No React, no DOM: everything is plain
// string arithmetic over (source, selectionStart, selectionEnd). The
// presentational component owns the textarea and the selection glue; the
// container routes toolbar clicks through `applyToolbarAction` and hands the
// resulting text + selection back down.

export interface EditResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

/**
 * Bold/italic/strikethrough/inline-code: wraps the selected range with the
 * marker pair and keeps the range selected, or — at a collapsed caret —
 * inserts an empty pair and parks the caret between the markers so the user
 * types straight into it.
 */
export function wrapSelection(source: string, start: number, end: number, marker: string): EditResult {
  const selected = source.slice(start, end)
  const text = source.slice(0, start) + marker + selected + marker + source.slice(end)
  return {
    text,
    selectionStart: start + marker.length,
    selectionEnd: end + marker.length
  }
}

/**
 * List: prefixes every line the selection touches (from the FIRST selected
 * line's own start), skipping the trailing empty line when the selection
 * ends right after a newline — selecting `uno\n` means "the uno line", not
 * "and also the empty line after it".
 */
export function prefixLines(source: string, start: number, end: number, prefix: string): EditResult {
  const lineStart = start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1
  const region = source.slice(lineStart, end)
  const lines = region.split('\n')
  let prefixedCount = 0
  const prefixed = lines
    .map((line, index) => {
      const isTrailingEmpty = index === lines.length - 1 && line === '' && lines.length > 1
      if (isTrailingEmpty) {
        return line
      }
      prefixedCount += 1
      return prefix + line
    })
    .join('\n')
  return {
    text: source.slice(0, lineStart) + prefixed + source.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: end + prefix.length * prefixedCount
  }
}

/**
 * Link: wraps the selection as `[selection](url)` selecting the `url`
 * placeholder (the text is already right, the URL is what's missing), or —
 * at a collapsed caret — inserts `[texto](url)` selecting the `texto`
 * placeholder.
 */
export function insertLink(source: string, start: number, end: number): EditResult {
  const selected = source.slice(start, end)
  if (selected.length > 0) {
    const text = `${source.slice(0, start)}[${selected}](url)${source.slice(end)}`
    const urlStart = start + 1 + selected.length + 2
    return { text, selectionStart: urlStart, selectionEnd: urlStart + 3 }
  }
  const text = `${source.slice(0, start)}[texto](url)${source.slice(end)}`
  return { text, selectionStart: start + 1, selectionEnd: start + 6 }
}

/** The closed set of toolbar buttons, in the approved design's order. */
export type ToolbarAction = 'bold' | 'italic' | 'strikethrough' | 'list' | 'code' | 'link'

const WRAP_MARKERS: Partial<Record<ToolbarAction, string>> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  code: '`'
}

/** Single dispatcher the container calls — one seam, no per-button wiring. */
export function applyToolbarAction(source: string, action: ToolbarAction, start: number, end: number): EditResult {
  const marker = WRAP_MARKERS[action]
  if (marker !== undefined) {
    return wrapSelection(source, start, end, marker)
  }
  if (action === 'list') {
    return prefixLines(source, start, end, '- ')
  }
  return insertLink(source, start, end)
}

/** Draft line count for the editor footer ("Markdown · N líneas"). An empty draft is one (empty) line. */
export function countLines(text: string): number {
  return text.split('\n').length
}

/** Case-insensitive `.md` test — decides whether the open flow routes into the in-app viewer. */
export function isMarkdownAttachment(fileName: string): boolean {
  return /\.md$/i.test(fileName)
}
