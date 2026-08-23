import { describe, expect, it } from 'vitest'
import {
  applyToolbarAction,
  countLines,
  insertLink,
  isMarkdownAttachment,
  prefixLines,
  wrapSelection
} from './markdownEditing'

// Pure toolbar helpers (markdown-attachment-viewer design — Edición mode).
// The DOM selection glue lives in the presentational component; everything
// here is plain string arithmetic over (source, selectionStart, selectionEnd).
describe('wrapSelection', () => {
  it('wraps the selected range and keeps it selected inside the markers', () => {
    expect(wrapSelection('hola mundo', 0, 4, '**')).toEqual({
      text: '**hola** mundo',
      selectionStart: 2,
      selectionEnd: 6
    })
  })

  it('inserts a marker pair at a collapsed caret and places the caret between them', () => {
    expect(wrapSelection('hola', 4, 4, '**')).toEqual({
      text: 'hola****',
      selectionStart: 6,
      selectionEnd: 6
    })
  })

  it('works with single-character markers mid-string', () => {
    expect(wrapSelection('a b c', 2, 3, '`')).toEqual({
      text: 'a `b` c',
      selectionStart: 3,
      selectionEnd: 4
    })
  })
})

describe('prefixLines', () => {
  it('prefixes the caret line from its own line start', () => {
    expect(prefixLines('uno\ndos', 5, 5, '- ')).toEqual({
      text: 'uno\n- dos',
      selectionStart: 7,
      selectionEnd: 7
    })
  })

  it('prefixes every line the selection touches', () => {
    expect(prefixLines('uno\ndos\ntres', 0, 12, '- ')).toEqual({
      text: '- uno\n- dos\n- tres',
      selectionStart: 2,
      selectionEnd: 18
    })
  })

  it('does not prefix the trailing empty line when the selection ends right after a newline', () => {
    expect(prefixLines('uno\ndos', 0, 4, '- ')).toEqual({
      text: '- uno\ndos',
      selectionStart: 2,
      selectionEnd: 6
    })
  })
})

describe('insertLink', () => {
  it('wraps the selection as [selection](url) and selects the url placeholder', () => {
    expect(insertLink('ver docs', 4, 8)).toEqual({
      text: 'ver [docs](url)',
      selectionStart: 11,
      selectionEnd: 14
    })
  })

  it('inserts [texto](url) at a collapsed caret and selects the texto placeholder', () => {
    expect(insertLink('x', 1, 1)).toEqual({
      text: 'x[texto](url)',
      selectionStart: 2,
      selectionEnd: 7
    })
  })
})

describe('applyToolbarAction', () => {
  it.each([
    ['bold', '**hola**'],
    ['italic', '*hola*'],
    ['strikethrough', '~~hola~~'],
    ['code', '`hola`']
  ] as const)('%s wraps the selection with its marker', (action, expected) => {
    expect(applyToolbarAction('hola', action, 0, 4).text).toBe(expected)
  })

  it('list prefixes the selected lines', () => {
    expect(applyToolbarAction('uno\ndos', 'list', 0, 7).text).toBe('- uno\n- dos')
  })

  it('link inserts the link template', () => {
    expect(applyToolbarAction('docs', 'link', 0, 4).text).toBe('[docs](url)')
  })
})

describe('countLines', () => {
  it('an empty draft is one line', () => {
    expect(countLines('')).toBe(1)
  })

  it('counts newline-separated lines, including a trailing empty one', () => {
    expect(countLines('a')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\n')).toBe(2)
  })
})

describe('isMarkdownAttachment', () => {
  it.each(['resumen.md', 'RESUMEN.MD', 'notas.Md'])('accepts %s case-insensitively', (fileName) => {
    expect(isMarkdownAttachment(fileName)).toBe(true)
  })

  it.each(['apuntes.pdf', 'md', 'notas.mdx', 'sin-extension'])('rejects %s', (fileName) => {
    expect(isMarkdownAttachment(fileName)).toBe(false)
  })
})
