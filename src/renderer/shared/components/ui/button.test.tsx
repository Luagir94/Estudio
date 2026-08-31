// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button — compact size', () => {
  // THE reason this size exists. The subject detail's chrome had its 29px
  // hand-written in five files and drifted anyway: 27px tabs beside 29px
  // section actions beside a 40px "Cerrar materia" that had silently
  // inherited the `default` size. One definition means one height.
  it('is 29px tall, labelled and icon-only alike', () => {
    render(
      <>
        <Button size="compact">Agregar entrega</Button>
        <Button size="compactIcon" aria-label="Sincronizar" />
      </>
    )

    expect(screen.getByRole('button', { name: 'Agregar entrega' })).toHaveClass('h-[29px]')
    const icon = screen.getByRole('button', { name: 'Sincronizar' })
    expect(icon).toHaveClass('h-[29px]')
    expect(icon).toHaveClass('w-[29px]')
  })

  it('keeps the design’s 12px/600 label at every size', () => {
    render(<Button size="compact">Agregar parcial</Button>)

    expect(screen.getByRole('button')).toHaveClass('text-body', 'font-semibold')
  })
})

describe('Button — tonal variant', () => {
  // The tier between `primary` and the neutral variants: a section action has
  // to be findable without competing with the one solid action a screen is
  // allowed. Four solid-violet buttons on one screen is what it replaced.
  it('fills with the brand’s soft step and inks with the brand', () => {
    render(
      <Button variant="tonal" size="compact">
        Agregar
      </Button>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-(--color-brand-soft)')
    expect(button).toHaveClass('text-primary-ink')
  })

  it('is not the primary fill — the two must stay distinguishable', () => {
    render(
      <>
        <Button variant="tonal">Tonal</Button>
        <Button variant="primary">Primary</Button>
      </>
    )

    expect(screen.getByRole('button', { name: 'Tonal' })).not.toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-primary')
  })
})
