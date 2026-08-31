// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InlinePathInput } from './InlinePathInput'

describe('InlinePathInput', () => {
  // A filesystem path is not a word and not the user's own data. Left alone,
  // the field offers autofill suggestions from unrelated text inputs and
  // underlines every segment of `C:\Users\…\claude.exe` as a spelling
  // mistake — noise on a field whose whole job is to hold one exact string.
  it('takes no autofill and no spellcheck — it holds a path, not prose', () => {
    render(<InlinePathInput provider="claude" overridePath={null} onCommit={vi.fn()} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })
})
