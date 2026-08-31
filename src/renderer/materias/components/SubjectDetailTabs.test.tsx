// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SubjectDetailTabs, type SubjectDetailTabId } from './SubjectDetailTabs'

const TABS = [
  { id: 'entregas' as const, label: 'Entregas', count: 3 },
  { id: 'parciales' as const, label: 'Parciales', count: 2 },
  { id: 'apuntes' as const, label: 'Apuntes', count: 0 },
  { id: 'notas' as const, label: 'Notas' }
]

function renderTabs(activeTab: SubjectDetailTabId = 'entregas', onSelect = vi.fn()): { onSelect: typeof onSelect } {
  render(<SubjectDetailTabs tabs={TABS} activeTab={activeTab} onSelect={onSelect} label="Secciones de la materia" />)
  return { onSelect }
}

describe('SubjectDetailTabs', () => {
  it('renders every tab with its count appended to the label', () => {
    renderTabs()

    expect(screen.getByRole('tab', { name: 'Entregas · 3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Parciales · 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Apuntes' })).toBeInTheDocument()
  })

  // A zero count is the section's own empty state to tell, not a number worth
  // printing beside its name — "Apuntes · 0" reads as a defect, not as calm.
  it('omits the count when it is zero and when the tab has none', () => {
    renderTabs()

    expect(screen.getByRole('tab', { name: 'Apuntes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Notas' })).toBeInTheDocument()
  })

  it('marks only the active tab as selected', () => {
    renderTabs('apuntes')

    expect(screen.getByRole('tab', { name: 'Apuntes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Entregas · 3' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports the clicked tab', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabs()

    await user.click(screen.getByRole('tab', { name: 'Parciales · 2' }))

    expect(onSelect).toHaveBeenCalledWith('parciales')
  })

  // Roving tabindex: only the active tab is in the page's tab order, and the
  // arrows move between the tabs themselves. Without it a keyboard user pays
  // five tab stops to reach the panel.
  it('keeps only the active tab in the tab order', () => {
    renderTabs('parciales')

    expect(screen.getByRole('tab', { name: 'Parciales · 2' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Entregas · 3' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves to the next tab with the right arrow and wraps at the end', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabs('entregas')

    screen.getByRole('tab', { name: 'Entregas · 3' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('parciales')

    onSelect.mockClear()
    render(<SubjectDetailTabs tabs={TABS} activeTab="notas" onSelect={onSelect} label="Secciones" />)
    screen.getAllByRole('tab', { name: 'Notas' }).at(-1)?.focus()
    await user.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenCalledWith('entregas')
  })

  it('moves to the previous tab with the left arrow and wraps at the start', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabs('entregas')

    screen.getByRole('tab', { name: 'Entregas · 3' }).focus()
    await user.keyboard('{ArrowLeft}')

    expect(onSelect).toHaveBeenCalledWith('notas')
  })

  it('jumps to the first and last tab with Home and End', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderTabs('parciales')

    screen.getByRole('tab', { name: 'Parciales · 2' }).focus()
    await user.keyboard('{End}')
    expect(onSelect).toHaveBeenCalledWith('notas')

    await user.keyboard('{Home}')
    expect(onSelect).toHaveBeenCalledWith('entregas')
  })

  it('names the tablist for assistive technology', () => {
    renderTabs()

    expect(screen.getByRole('tablist', { name: 'Secciones de la materia' })).toBeInTheDocument()
  })

  // The portal slot is always in the DOM, so a tab whose action arrives
  // through `action` puts TWO children in that wrapper — the button and an
  // empty div. A `gap` there measures the void between them and slides the
  // button off the row's end, which is exactly what "en entregas el botón se
  // desplaza a la izquierda" was.
  it('adds no gap around the action, so an empty portal slot cannot shift it', () => {
    render(
      <SubjectDetailTabs
        tabs={TABS}
        activeTab="entregas"
        onSelect={vi.fn()}
        label="Secciones"
        action={<button type="button">Agregar entrega</button>}
      />
    )

    const wrapper = screen.getByRole('button', { name: 'Agregar entrega' }).parentElement
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).not.toMatch(/\bgap-/)
    // And the empty slot really is there beside it — the reason the gap bites.
    expect(wrapper?.children).toHaveLength(2)
  })

  it('points each tab at the panel it controls', () => {
    renderTabs()

    expect(screen.getByRole('tab', { name: 'Entregas · 3' })).toHaveAttribute(
      'aria-controls',
      'subject-detail-panel-entregas'
    )
  })
})
