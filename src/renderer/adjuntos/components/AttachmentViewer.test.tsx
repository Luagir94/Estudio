// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AttachmentViewer, type AttachmentViewerProps } from './AttachmentViewer'

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    subjectId: 42,
    fileName: 'Resumen unidad 3.md',
    mimeType: null,
    sizeBytes: 8397,
    title: null,
    createdAt: '2026-08-18T10:00',
    indexStatus: 'indexed',
    origin: 'user',
    ...overrides
  }
}

function renderViewer(overrides: Partial<AttachmentViewerProps> = {}) {
  const props: AttachmentViewerProps = {
    attachment: attachment(),
    subjectName: 'Sistemas Operativos',
    mode: 'vista',
    content: '# Resumen unidad 3',
    draft: '',
    dirty: false,
    isLoading: false,
    isError: false,
    isMissing: false,
    editorSelection: null,
    onBack: vi.fn(),
    onModeChange: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onOpenExternal: vi.fn(),
    onToolbarAction: vi.fn(),
    ...overrides
  }
  return { ...render(<AttachmentViewer {...props} />), props }
}

describe('AttachmentViewer — header', () => {
  it('renders the back link with the subject name and the chevron icon, wired to onBack', () => {
    const { container, props } = renderViewer()

    const back = screen.getByRole('button', { name: 'Sistemas Operativos' })
    expect(container.querySelector('svg.lucide-chevron-left')).not.toBeNull()

    fireEvent.click(back)
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('renders the file identity block: extension chip, file-text icon and the file name', () => {
    const { container } = renderViewer()

    expect(screen.getByText('MD')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-file-text')).not.toBeNull()
    expect(screen.getByText('Resumen unidad 3.md')).toBeInTheDocument()
  })

  it('vista mode shows the meta line with the edited date and the index badge', () => {
    const { container } = renderViewer()

    expect(screen.getByText('8,2 KB · Editado 18 ago')).toBeInTheDocument()
    expect(screen.getByText('Indexado')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('edición mode shows "Editando ahora" and the "Sin guardar" badge only while dirty', () => {
    const { container, unmount } = renderViewer({ mode: 'edicion', dirty: true })

    expect(screen.getByText('8,2 KB · Editando ahora')).toBeInTheDocument()
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-pencil')).not.toBeNull()
    unmount()

    renderViewer({ mode: 'edicion', dirty: false })
    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument()
  })

  it('marks the active segment with aria-pressed and reports mode changes', () => {
    const { props } = renderViewer()

    expect(screen.getByRole('button', { name: 'Vista' })).toHaveAttribute('aria-pressed', 'true')
    const edicion = screen.getByRole('button', { name: 'Edición' })
    expect(edicion).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(edicion)
    expect(props.onModeChange).toHaveBeenCalledWith('edicion')
  })

  it('vista mode offers the OS-open icon button', () => {
    const { container, props } = renderViewer()

    const open = screen.getByRole('button', { name: 'Abrir con la aplicación del sistema' })
    expect(container.querySelector('svg.lucide-external-link')).not.toBeNull()

    fireEvent.click(open)
    expect(props.onOpenExternal).toHaveBeenCalledTimes(1)
  })

  it('edición mode replaces the OS-open button with Cancelar and Guardar', () => {
    const { props } = renderViewer({ mode: 'edicion' })

    expect(screen.queryByRole('button', { name: 'Abrir con la aplicación del sistema' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })
})

describe('AttachmentViewer — vista content states', () => {
  it('renders the parsed markdown content', () => {
    renderViewer({ content: '# Resumen unidad 3\n\npárrafo de apuntes' })

    expect(screen.getByRole('heading', { level: 1, name: 'Resumen unidad 3' })).toBeInTheDocument()
    expect(screen.getByText('párrafo de apuntes')).toBeInTheDocument()
  })

  it('renders the loading state before the content resolves', () => {
    renderViewer({ content: undefined, isLoading: true })

    expect(screen.getAllByTestId('visor-skeleton-line').length).toBeGreaterThan(0)
  })

  it('renders the error state when the read fails', () => {
    renderViewer({ content: undefined, isError: true })

    expect(screen.getByText('No se pudo cargar el documento')).toBeInTheDocument()
  })

  it('renders the missing-file state when the stored file is gone', () => {
    renderViewer({ content: undefined, isMissing: true })

    expect(screen.getByText('No se encontró el archivo en disco')).toBeInTheDocument()
  })
})

describe('AttachmentViewer — edición', () => {
  it('renders the draft inside a mono textarea and reports edits', () => {
    const { props } = renderViewer({ mode: 'edicion', draft: '# Borrador' })

    const editor = screen.getByRole('textbox', { name: 'Editor de markdown' })
    expect(editor).toHaveValue('# Borrador')

    fireEvent.change(editor, { target: { value: '# Borrador!' } })
    expect(props.onDraftChange).toHaveBeenCalledWith('# Borrador!')
  })

  it('renders the six toolbar buttons in the design order', () => {
    renderViewer({ mode: 'edicion' })

    for (const label of ['Negrita', 'Cursiva', 'Tachado', 'Lista', 'Código', 'Enlace']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('reports a toolbar action together with the textarea selection', () => {
    const { props } = renderViewer({ mode: 'edicion', draft: 'hola mundo' })

    const editor = screen.getByRole('textbox', { name: 'Editor de markdown' }) as HTMLTextAreaElement
    editor.setSelectionRange(0, 4)

    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(props.onToolbarAction).toHaveBeenCalledWith('bold', { start: 0, end: 4 })
  })

  it('applies an editorSelection prop onto the textarea', () => {
    renderViewer({ mode: 'edicion', draft: '**hola** mundo', editorSelection: { start: 2, end: 6 } })

    const editor = screen.getByRole('textbox', { name: 'Editor de markdown' }) as HTMLTextAreaElement
    expect(editor.selectionStart).toBe(2)
    expect(editor.selectionEnd).toBe(6)
  })

  it('renders the re-index hint and the live line count in the footer', () => {
    renderViewer({ mode: 'edicion', draft: 'uno\ndos\ntres' })

    expect(screen.getByText('Al guardar, el adjunto se vuelve a indexar para Preguntar')).toBeInTheDocument()
    expect(screen.getByText('Markdown · 3 líneas')).toBeInTheDocument()
  })

  it('pluralizes the line count for a single-line draft', () => {
    renderViewer({ mode: 'edicion', draft: 'una sola' })

    expect(screen.getByText('Markdown · 1 línea')).toBeInTheDocument()
  })
})
