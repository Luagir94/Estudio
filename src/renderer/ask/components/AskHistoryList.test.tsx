// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../shared/ipc/ask'
import { AskHistoryList } from './AskHistoryList'

const now = new Date('2026-08-18T20:00')

function summary(overrides: Partial<ConversationSummary> & { id: number }): ConversationSummary {
  return {
    title: `Hilo ${overrides.id}`,
    createdAt: '2026-08-18T09:00',
    updatedAt: '2026-08-18T09:00',
    ...overrides
  }
}

describe('AskHistoryList', () => {
  it('renders one row per conversation, in the order the caller gave them, with exactly one selected', () => {
    const conversations = [
      summary({ id: 9, title: '¿Quién escribió el Martín Fierro?', updatedAt: '2026-08-18T14:32' }),
      summary({ id: 3, title: 'Peso de la primera parcial', updatedAt: '2026-08-17T19:05' })
    ]

    const { container } = render(
      <AskHistoryList
        conversations={conversations}
        activeId={9}
        now={now}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const rows = container.querySelectorAll('[data-selected]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('¿Quién escribió el Martín Fierro?')
    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveTextContent('Peso de la primera parcial')
    expect(rows[1]).toHaveAttribute('data-selected', 'false')
    // Exactly one row carries the selected fill (design #268 §3).
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(1)
  })

  it('renders the relative date per row', () => {
    render(
      <AskHistoryList
        conversations={[summary({ id: 1, updatedAt: '2026-08-18T14:32' })]}
        activeId={null}
        now={now}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('Hoy, 14:32')).toBeInTheDocument()
  })

  it('calls onSelect with the row id when the row body is clicked', () => {
    const onSelect = vi.fn()
    render(
      <AskHistoryList
        conversations={[summary({ id: 7 })]}
        activeId={null}
        now={now}
        onSelect={onSelect}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Hilo 7'))

    expect(onSelect).toHaveBeenCalledWith(7)
  })

  it('carries the new-conversation label and calls onNewConversation when clicked', () => {
    const onNewConversation = vi.fn()
    render(
      <AskHistoryList
        conversations={[]}
        activeId={null}
        now={now}
        onSelect={vi.fn()}
        onNewConversation={onNewConversation}
        onDelete={vi.fn()}
      />
    )

    // `getByText` normalizes whitespace (collapses the pinned double space)
    // before matching — the exact copy itself is pinned in `askDisplay.test.ts`.
    fireEvent.click(screen.getByText('+ Conversación nueva'))

    expect(onNewConversation).toHaveBeenCalled()
  })

  it('calls onDelete with the row id when its delete button is clicked, without also selecting the row', () => {
    const onDelete = vi.fn()
    const onSelect = vi.fn()
    render(
      <AskHistoryList
        conversations={[summary({ id: 5 })]}
        activeId={null}
        now={now}
        onSelect={onSelect}
        onNewConversation={vi.fn()}
        onDelete={onDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    expect(onDelete).toHaveBeenCalledWith(5)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders no conversation rows when the list is empty, keeping only the new-conversation action', () => {
    const { container } = render(
      <AskHistoryList
        conversations={[]}
        activeId={null}
        now={now}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('+ Conversación nueva')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-selected]')).toHaveLength(0)
  })
})
