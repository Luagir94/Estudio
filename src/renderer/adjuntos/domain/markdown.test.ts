import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

// In-house block parser (markdown-attachment-viewer design — the Vista mode
// renders TYPED blocks/spans, never html strings; no dangerouslySetInnerHTML
// anywhere downstream). Unknown or malformed syntax must DEGRADE to plain
// text, never throw.
describe('parseMarkdown — blocks', () => {
  it('returns no blocks for an empty source', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('returns no blocks for a whitespace-only source', () => {
    expect(parseMarkdown('   \n\n  \n')).toEqual([])
  })

  it('parses # / ## / ### headings with their level', () => {
    expect(parseMarkdown('# Uno\n## Dos\n### Tres')).toEqual([
      { type: 'heading', level: 1, spans: [{ type: 'text', text: 'Uno' }] },
      { type: 'heading', level: 2, spans: [{ type: 'text', text: 'Dos' }] },
      { type: 'heading', level: 3, spans: [{ type: 'text', text: 'Tres' }] }
    ])
  })

  it('degrades a 4-hash heading to a plain paragraph — outside the covered set', () => {
    expect(parseMarkdown('#### Cuatro')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: '#### Cuatro' }] }
    ])
  })

  it('degrades a hash without a following space to a plain paragraph', () => {
    expect(parseMarkdown('#sinespacio')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: '#sinespacio' }] }
    ])
  })

  it('joins consecutive non-blank lines into ONE paragraph', () => {
    expect(parseMarkdown('línea uno\nlínea dos')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: 'línea uno línea dos' }] }
    ])
  })

  it('separates paragraphs on blank lines', () => {
    expect(parseMarkdown('uno\n\ndos')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: 'uno' }] },
      { type: 'paragraph', spans: [{ type: 'text', text: 'dos' }] }
    ])
  })

  it('groups consecutive - and * items into ONE list', () => {
    expect(parseMarkdown('- uno\n* dos')).toEqual([
      {
        type: 'list',
        items: [[{ type: 'text', text: 'uno' }], [{ type: 'text', text: 'dos' }]]
      }
    ])
  })

  it('inline-parses list items — the FCFS bold-lead case from the approved design', () => {
    expect(parseMarkdown('- **FCFS** — se atiende por orden de llegada.')).toEqual([
      {
        type: 'list',
        items: [
          [
            { type: 'bold', text: 'FCFS' },
            { type: 'text', text: ' — se atiende por orden de llegada.' }
          ]
        ]
      }
    ])
  })

  it('a heading interrupts a list into a separate block', () => {
    expect(parseMarkdown('- uno\n## Corte\n- dos')).toEqual([
      { type: 'list', items: [[{ type: 'text', text: 'uno' }]] },
      { type: 'heading', level: 2, spans: [{ type: 'text', text: 'Corte' }] },
      { type: 'list', items: [[{ type: 'text', text: 'dos' }]] }
    ])
  })

  it('merges consecutive > lines into one blockquote', () => {
    expect(parseMarkdown('> El mejor algoritmo\n> depende de la carga.')).toEqual([
      { type: 'blockquote', spans: [{ type: 'text', text: 'El mejor algoritmo depende de la carga.' }] }
    ])
  })

  it('keeps fenced code content VERBATIM, with its language tag', () => {
    const source = '```python\ndef fcfs(processes):\n    return processes\n```'
    expect(parseMarkdown(source)).toEqual([
      { type: 'code-block', language: 'python', content: 'def fcfs(processes):\n    return processes' }
    ])
  })

  it('a fence with no tag yields a null language', () => {
    expect(parseMarkdown('```\nplain\n```')).toEqual([{ type: 'code-block', language: null, content: 'plain' }])
  })

  it('markdown syntax INSIDE a fence stays verbatim text, never blocks or spans', () => {
    const source = '```\n# no es heading\n- no es lista\n**no es bold**\n```'
    expect(parseMarkdown(source)).toEqual([
      { type: 'code-block', language: null, content: '# no es heading\n- no es lista\n**no es bold**' }
    ])
  })

  it('an unterminated fence swallows the rest of the document as code — degrade, never throw', () => {
    expect(parseMarkdown('```js\nconst a = 1\nsin cierre')).toEqual([
      { type: 'code-block', language: 'js', content: 'const a = 1\nsin cierre' }
    ])
  })

  it('preserves blank lines inside a fence', () => {
    expect(parseMarkdown('```\nuno\n\ndos\n```')).toEqual([
      { type: 'code-block', language: null, content: 'uno\n\ndos' }
    ])
  })

  it('normalizes CRLF input — same blocks as LF input', () => {
    expect(parseMarkdown('# Título\r\n\r\npárrafo\r\n')).toEqual([
      { type: 'heading', level: 1, spans: [{ type: 'text', text: 'Título' }] },
      { type: 'paragraph', spans: [{ type: 'text', text: 'párrafo' }] }
    ])
  })
})

describe('parseInline — spans', () => {
  it('returns typed spans for bold, italic, code and strikethrough', () => {
    expect(parseInline('a **b** *c* _d_ `e` ~~f~~')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'd' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
      { type: 'text', text: ' ' },
      { type: 'strikethrough', text: 'f' }
    ])
  })

  it('does NOT recursively parse nested markers — inner syntax stays literal inside the outer span', () => {
    expect(parseInline('**bold *inner* tail**')).toEqual([{ type: 'bold', text: 'bold *inner* tail' }])
  })

  it('an unclosed marker degrades to literal text', () => {
    expect(parseInline('sin **cierre')).toEqual([{ type: 'text', text: 'sin **cierre' }])
  })

  it('an empty marker pair degrades to literal text', () => {
    expect(parseInline('vacío **** aquí')).toEqual([{ type: 'text', text: 'vacío **** aquí' }])
  })

  it('emphasis whose inner text starts or ends with a space stays literal — `2 * 3 * 4` is arithmetic, not italics', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }])
  })

  it('inline code keeps emphasis markers verbatim', () => {
    expect(parseInline('`*no cursiva*`')).toEqual([{ type: 'code', text: '*no cursiva*' }])
  })

  it('returns no spans for an empty string', () => {
    expect(parseInline('')).toEqual([])
  })
})
