// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorSwatchPicker, SUBJECT_COLORS } from './ColorSwatchPicker'

describe('ColorSwatchPicker', () => {
  it('offers every catalogued colour plus the custom one', () => {
    render(<ColorSwatchPicker value={SUBJECT_COLORS[0]} onChange={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(SUBJECT_COLORS.length)
    expect(screen.getByLabelText('Color personalizado')).toBeInTheDocument()
  })

  it('reports the colour that was clicked', () => {
    const onChange = vi.fn()
    render(<ColorSwatchPicker value={SUBJECT_COLORS[0]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: `Color ${SUBJECT_COLORS[2]}` }))

    expect(onChange).toHaveBeenCalledWith(SUBJECT_COLORS[2])
  })

  it('marks the current colour as pressed and the others as not', () => {
    render(<ColorSwatchPicker value={SUBJECT_COLORS[1]} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: `Color ${SUBJECT_COLORS[1]}` })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: `Color ${SUBJECT_COLORS[0]}` })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a colour chosen from the native picker', () => {
    const onChange = vi.fn()
    render(<ColorSwatchPicker value={SUBJECT_COLORS[0]} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Color personalizado'), { target: { value: '#123456' } })

    expect(onChange).toHaveBeenCalledWith('#123456')
  })

  // Without this the swatch row goes blank the moment you pick your own
  // colour: none of the five match, so nothing carries the ring and the field
  // reads as unset while holding a perfectly good value.
  it('shows the custom swatch as the selected one when the value is off-catalogue', () => {
    render(<ColorSwatchPicker value="#123456" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Color personalizado')).toHaveValue('#123456')
    for (const option of SUBJECT_COLORS) {
      expect(screen.getByRole('button', { name: `Color ${option}` })).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
