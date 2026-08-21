// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DETECTING_LABEL, PATH_INPUT_PLACEHOLDER } from '../domain/connectionDisplay'
import { DetectingProviderCard } from './DetectingProviderCard'

describe('DetectingProviderCard', () => {
  it('names the CLI it is probing, so the row is identifiable before any result arrives', () => {
    render(<DetectingProviderCard provider="antigravity" />)

    expect(screen.getByRole('heading', { name: 'Antigravity CLI' })).toBeInTheDocument()
  })

  it('shows the detecting chip instead of an empty or absent row', () => {
    render(<DetectingProviderCard provider="claude" />)

    expect(screen.getByText(DETECTING_LABEL)).toBeInTheDocument()
  })

  // A silent spinner tells half the users nothing — same standard as
  // `AskStateCard`'s `busy`.
  it('announces itself as a live status for screen readers', () => {
    render(<DetectingProviderCard provider="codex" />)

    expect(screen.getByRole('status')).toHaveTextContent(DETECTING_LABEL)
  })

  // The whole point of the row: it must NOT claim a state it has not observed.
  it('makes no claim about version, executable or capabilities', () => {
    render(<DetectingProviderCard provider="claude" />)

    expect(screen.queryByText('Conectado')).not.toBeInTheDocument()
    expect(screen.queryByText('No encontrado')).not.toBeInTheDocument()
    expect(screen.queryByText('Detección automática en el PATH')).not.toBeInTheDocument()
  })

  // Offering a path mid-probe would invite an edit that the answer already in
  // flight is about to contradict.
  it('offers no path field while the probe is still running', () => {
    render(<DetectingProviderCard provider="claude" />)

    expect(screen.queryByPlaceholderText(PATH_INPUT_PLACEHOLDER)).not.toBeInTheDocument()
  })
})
