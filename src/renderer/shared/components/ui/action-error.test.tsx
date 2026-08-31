// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActionError } from './action-error'

describe('ActionError', () => {
  // The reason this component exists. The message lands after the user already
  // pressed the button: nothing moves focus to it, nothing marks a field, it
  // just appears. Without a role it is a paragraph nobody is told about.
  it('announces itself — the failure arrives after the user moved on', () => {
    render(<ActionError message="No se pudieron guardar los cambios." />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron guardar los cambios.')
  })

  it('renders nothing when there is no failure to report', () => {
    const { container: nothing } = render(<ActionError message={null} />)
    expect(nothing).toBeEmptyDOMElement()

    const { container: absent } = render(<ActionError message={undefined} />)
    expect(absent).toBeEmptyDOMElement()

    // An empty string is a failure with no sentence — an empty alert would
    // announce a pause and say nothing.
    const { container: blank } = render(<ActionError message="" />)
    expect(blank).toBeEmptyDOMElement()
  })

  // The type step is per-slot: a footer note is `text-caption`, a dialog body
  // is `text-body-lg`. Only the ink and the semantics are fixed here.
  it('keeps the destructive ink while the caller sets the type step', () => {
    render(<ActionError message="Falló." className="text-caption" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('text-destructive')
    expect(alert).toHaveClass('text-caption')
  })
})
