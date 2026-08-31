// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldError, useFieldErrors } from './field-error'
import { Input } from './input'
import { Label } from './label'

function Form({ nameError, codeError }: { nameError?: string; codeError?: string }): React.JSX.Element {
  const fields = useFieldErrors()
  const name = fields.bind('name', nameError)
  const code = fields.bind('code', codeError)
  return (
    <form>
      <Label>
        NOMBRE
        <Input type="text" {...name.control} />
      </Label>
      <FieldError {...name.error} />
      <Label>
        CÓDIGO
        <Input type="text" {...code.control} />
      </Label>
      <FieldError {...code.error} />
    </form>
  )
}

describe('useFieldErrors', () => {
  it('points the invalid control at its own message', () => {
    render(<Form nameError="Poné un nombre." />)

    const input = screen.getByLabelText('NOMBRE')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // The whole point: the id on the control and the id on the paragraph are
    // one value, produced once, so they cannot drift apart.
    expect(input).toHaveAccessibleDescription('Poné un nombre.')
  })

  it('leaves a valid control unmarked — no stale invalid state, no dangling description', () => {
    render(<Form nameError="Poné un nombre." />)

    const code = screen.getByLabelText('CÓDIGO')
    expect(code).not.toHaveAttribute('aria-invalid')
    expect(code).not.toHaveAttribute('aria-describedby')
  })

  it('keeps two fields of the same form on separate ids', () => {
    render(<Form nameError="Poné un nombre." codeError="Ese código ya existe." />)

    expect(screen.getByLabelText('NOMBRE')).toHaveAccessibleDescription('Poné un nombre.')
    expect(screen.getByLabelText('CÓDIGO')).toHaveAccessibleDescription('Ese código ya existe.')
  })

  // Two forms carrying a field called `name` can be mounted at once — a modal
  // over a screen that owns its own inline form. Name-derived ids would
  // collide there and point both controls at the first paragraph.
  it('keeps the same field name unique across two mounted forms', () => {
    render(
      <>
        <Form nameError="Error de arriba." />
        <Form nameError="Error de abajo." />
      </>
    )

    const [first, second] = screen.getAllByLabelText('NOMBRE')
    expect(first).toHaveAccessibleDescription('Error de arriba.')
    expect(second).toHaveAccessibleDescription('Error de abajo.')
  })
})

describe('FieldError', () => {
  it('renders nothing while the field is valid, so call sites need no guard', () => {
    const { container } = render(<FieldError id="x" message={undefined} />)

    expect(container).toBeEmptyDOMElement()
  })

  // One alert per invalid field would queue five interruptions to say what a
  // summary says once. Announcing the batch is the summary's job.
  it('does not announce itself — it is a description, not an alert', () => {
    render(<FieldError id="x" message="Poné un nombre." />)

    expect(screen.getByText('Poné un nombre.')).not.toHaveAttribute('role', 'alert')
  })
})
