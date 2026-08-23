// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../domain/markdown'
import { MarkdownView } from './MarkdownView'

// Presentational renderer for the parsed blocks (markdown-attachment-viewer
// design — Vista mode typography). Fed through the REAL parser on purpose:
// the two are one pipeline, and the design's FCFS case is specified end to
// end (source line → accent bullet + bold lead).
describe('MarkdownView', () => {
  it('renders headings with their level as real heading elements', () => {
    render(<MarkdownView blocks={parseMarkdown('# Título\n## Sección\n### Detalle')} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Sección' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Detalle' })).toBeInTheDocument()
  })

  it('renders a paragraph with its inline spans typed, never raw markers', () => {
    render(<MarkdownView blocks={parseMarkdown('texto con **negrita** y *cursiva*')} />)

    expect(screen.getByText('negrita')).toBeInTheDocument()
    expect(screen.getByText('cursiva')).toBeInTheDocument()
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  it('renders list items as a real list with the accent bullet glyph', () => {
    render(<MarkdownView blocks={parseMarkdown('- uno\n- dos')} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByText('•')).toHaveLength(2)
  })

  it('renders the design FCFS case: bold lead inside a list item', () => {
    render(<MarkdownView blocks={parseMarkdown('- **FCFS** — se atiende por orden de llegada.')} />)

    expect(screen.getByText('FCFS')).toBeInTheDocument()
    expect(screen.getByText('— se atiende por orden de llegada.')).toBeInTheDocument()
  })

  it('renders a blockquote with its text', () => {
    render(<MarkdownView blocks={parseMarkdown('> El mejor algoritmo depende de la carga.')} />)

    expect(screen.getByText('El mejor algoritmo depende de la carga.')).toBeInTheDocument()
  })

  it('renders a fenced code block with its language tag and verbatim content', () => {
    render(<MarkdownView blocks={parseMarkdown('```python\ndef fcfs(processes):\n    return processes\n```')} />)

    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText(/def fcfs\(processes\):/)).toBeInTheDocument()
  })

  it('omits the language tag when the fence has none', () => {
    const { container } = render(<MarkdownView blocks={parseMarkdown('```\nplain\n```')} />)

    expect(screen.getByText('plain')).toBeInTheDocument()
    expect(container.querySelectorAll('pre')).toHaveLength(1)
  })

  it('never uses dangerouslySetInnerHTML — inline code renders as a real element', () => {
    const { container } = render(<MarkdownView blocks={parseMarkdown('usa `sorted()` acá')} />)

    expect(screen.getByText('sorted()')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('&lt;script&gt;')
  })

  it('renders nothing for an empty block list', () => {
    const { container } = render(<MarkdownView blocks={[]} />)

    expect(container.firstElementChild?.childElementCount ?? 0).toBe(0)
  })
})
