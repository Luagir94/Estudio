// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DialogBody, DialogContent, DialogFooter, DialogOverlay } from './dialog'

// Focus/keyboard contract of the shared dialog shell. Every `role="dialog"`
// in the app renders through `DialogContent`, so this file is where modal
// semantics (aria-modal, Escape, focus trap, focus restore) are proven once
// instead of 14 times in the consumers.
describe('DialogContent', () => {
  it('marks the dialog as modal', () => {
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogBody>content</DialogBody>
        </DialogContent>
      </DialogOverlay>
    )

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toHaveAttribute('aria-modal', 'true')
  })

  it('calls onDismiss when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog" onDismiss={onDismiss}>
          <DialogFooter>
            <button type="button">Ok</button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )

    await user.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // The prop is optional on purpose: a dialog without a dismiss path must
  // simply ignore Escape rather than crash or close itself.
  it('does nothing on Escape when no onDismiss is provided', async () => {
    const user = userEvent.setup()
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogFooter>
            <button type="button">Ok</button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )

    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveFocus()
  })

  // Confirm dialogs put Cancel first in the footer, so "first focusable"
  // doubles as "safest default" for destructive confirmations.
  it('moves focus to the first focusable element on open', () => {
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogFooter>
            <button type="button">Cancel</button>
            <button type="button">Confirm</button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('focuses the dialog itself when it has no focusable content', () => {
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogBody>just text</DialogBody>
        </DialogContent>
      </DialogOverlay>
    )

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toHaveFocus()
  })

  it('wraps Tab from the last focusable element back to the first', async () => {
    const user = userEvent.setup()
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogFooter>
            <button type="button">First</button>
            <button type="button">Last</button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )

    screen.getByRole('button', { name: 'Last' }).focus()
    await user.tab()

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the first focusable element back to the last', async () => {
    const user = userEvent.setup()
    render(
      <DialogOverlay>
        <DialogContent aria-label="Test dialog">
          <DialogFooter>
            <button type="button">First</button>
            <button type="button">Last</button>
          </DialogFooter>
        </DialogContent>
      </DialogOverlay>
    )

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab({ shift: true })

    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('restores focus to the previously focused element on close', async () => {
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          {open && (
            <DialogOverlay>
              <DialogContent aria-label="Test dialog" onDismiss={() => setOpen(false)}>
                <DialogFooter>
                  <button type="button">Inside</button>
                </DialogFooter>
              </DialogContent>
            </DialogOverlay>
          )}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus()
  })
})
