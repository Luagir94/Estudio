// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AjustesSectionTabs } from './AjustesSectionTabs'

describe('AjustesSectionTabs', () => {
  it('names every section in the design order', () => {
    render(<AjustesSectionTabs value="apariencia" onChange={() => {}} />)

    const tabs = screen.getAllByRole('button')

    expect(tabs.map((tab) => tab.textContent)).toEqual(['Apariencia', 'Integraciones', 'Permisos'])
  })

  it('presses only the active section', () => {
    render(<AjustesSectionTabs value="integraciones" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Integraciones' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Apariencia' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Permisos' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the section the student pressed', async () => {
    const onChange = vi.fn()
    render(<AjustesSectionTabs value="apariencia" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Permisos' }))

    expect(onChange).toHaveBeenCalledWith('permisos')
  })

  it('groups the tabs under one accessible name', () => {
    render(<AjustesSectionTabs value="apariencia" onChange={() => {}} />)

    expect(screen.getByRole('group', { name: 'Secciones de ajustes' })).toBeInTheDocument()
  })
})
