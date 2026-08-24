// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

// A component whose only job is to crash during render — the case the
// boundary exists for.
function Bomb(): never {
  throw new Error('render boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>safe-child</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('safe-child')).toBeInTheDocument()
  })

  it('renders the Spanish fallback instead of a blank window when a child render throws', () => {
    // React reports every caught render error via console.error even when a
    // boundary handles it — silence that expected noise for this test only.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
    expect(screen.getByText('Reiniciá la aplicación para volver a intentarlo.')).toBeInTheDocument()
  })
})
