// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  // Slice 5: Hoy is the fourth and final domain to get a built screen — its
  // nav item flips from an inert span to a real navigation control, matching
  // the precedent set by Horario (slice 3) and Entregas (slice 4).
  it('flips Hoy to an interactive, available nav item', () => {
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    const hoy = screen.getByRole('button', { name: 'Hoy' })
    expect(hoy).not.toHaveAttribute('aria-disabled', 'true')
  })

  // The brand block used to print a hardcoded "2027 · Primer cuatrimestre"
  // regardless of what was in the database.
  it('names the running carrera and período', () => {
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        terms={[{ programName: 'Abogacía', periodName: '1er cuatrimestre' }]}
      />
    )

    expect(screen.getByText('Abogacía · 1er cuatrimestre')).toBeInTheDocument()
  })

  // There is no "active carrera" in this app — several can be cursadas at
  // once. Naming one of them would invent a concept the product does not
  // have, so the plural case COUNTS instead of choosing.
  it('counts instead of picking a winner when several períodos are running', () => {
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        terms={[
          { programName: 'Abogacía', periodName: '1er cuatrimestre' },
          { programName: 'Abogacía', periodName: 'Anual 2026' },
          { programName: 'Inglés', periodName: 'Módulo 3' }
        ]}
      />
    )

    expect(screen.getByText('3 períodos activos')).toBeInTheDocument()
    expect(screen.queryByText(/Abogacía/)).not.toBeInTheDocument()
  })

  it('says so plainly when nothing is running, instead of naming a stale período', () => {
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        terms={[]}
      />
    )

    expect(screen.getByText('Sin período activo')).toBeInTheDocument()
  })

  it('drops the term line entirely in rail mode, where there is no room for it', () => {
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={true}
        onToggleCollapsed={vi.fn()}
        terms={[{ programName: 'Abogacía', periodName: '1er cuatrimestre' }]}
      />
    )

    expect(screen.queryByText('Abogacía · 1er cuatrimestre')).not.toBeInTheDocument()
  })

  it('clicking Hoy calls onNavigate with "hoy"', () => {
    const onNavigate = vi.fn()
    render(
      <Sidebar
        active="materias"
        onNavigate={onNavigate}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))

    expect(onNavigate).toHaveBeenCalledWith('hoy')
  })

  // Slice 3: Horario is the second domain to get a built screen — its nav
  // item flips from an inert span to a real navigation control.
  it('flips Horario to an interactive, available nav item', () => {
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    const horario = screen.getByRole('button', { name: 'Horario' })
    expect(horario).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('clicking an available nav item calls onNavigate with its domain', () => {
    const onNavigate = vi.fn()
    render(
      <Sidebar
        active="materias"
        onNavigate={onNavigate}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Horario' }))

    expect(onNavigate).toHaveBeenCalledWith('horario')
  })

  it('marks the active domain with aria-current="page"', () => {
    render(
      <Sidebar active="horario" onNavigate={vi.fn()} onExport={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Horario' })).toHaveAttribute('aria-current', 'page')
  })

  // Slice 4: Entregas is the third domain to get a built screen.
  it('flips Entregas to an interactive, available nav item', () => {
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    const entregas = screen.getByRole('button', { name: 'Entregas' })
    expect(entregas).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('clicking Entregas calls onNavigate with "entregas"', () => {
    const onNavigate = vi.fn()
    render(
      <Sidebar
        active="materias"
        onNavigate={onNavigate}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Entregas' }))

    expect(onNavigate).toHaveBeenCalledWith('entregas')
  })

  // The approved design puts Planificador SECOND, immediately after Hoy —
  // it renames the .pen's long-unimplemented "Organizador" slot rather than
  // appending an eighth item.
  it('places Planificador second, right after Hoy', () => {
    render(
      <Sidebar active="hoy" onNavigate={vi.fn()} onExport={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />
    )

    const labels = screen.getAllByRole('button').map((button) => button.textContent)

    expect(labels.slice(1, 3)).toEqual(['Hoy', 'Planificador'])
  })

  it('clicking Planificador calls onNavigate with "planificador"', () => {
    const onNavigate = vi.fn()
    render(
      <Sidebar active="hoy" onNavigate={onNavigate} onExport={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Planificador' }))

    expect(onNavigate).toHaveBeenCalledWith('planificador')
  })

  // PR7: Ajustes is the sixth and last nav item (design node `wx0uR`'s
  // sibling in the approved `.pen`), placed after Carreras.
  it('flips Ajustes to an interactive, available nav item', () => {
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    const ajustes = screen.getByRole('button', { name: 'Ajustes' })
    expect(ajustes).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('clicking Ajustes calls onNavigate with "ajustes"', () => {
    const onNavigate = vi.fn()
    render(
      <Sidebar
        active="materias"
        onNavigate={onNavigate}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))

    expect(onNavigate).toHaveBeenCalledWith('ajustes')
  })

  // Slice 5: the export footer row was deliberately left inert by the
  // styling corrective unit ("no IPC to back it yet") — now wired.
  it('renders "Exportar datos" as an interactive button, not a static row', () => {
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Exportar datos' })).toBeInTheDocument()
  })

  it('clicking "Exportar datos" calls onExport', () => {
    const onExport = vi.fn()
    render(
      <Sidebar
        active="materias"
        onNavigate={vi.fn()}
        onExport={onExport}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Exportar datos' }))

    expect(onExport).toHaveBeenCalledTimes(1)
  })

  // Collapsing is a markup change, not a width animation — so the guarantee
  // worth testing is that NOTHING becomes unreachable in the rail.
  describe('collapsed (rail)', () => {
    const renderCollapsed = (overrides = {}) =>
      render(
        <Sidebar
          active="hoy"
          onNavigate={vi.fn()}
          onExport={vi.fn()}
          collapsed
          onToggleCollapsed={vi.fn()}
          {...overrides}
        />
      )

    it('keeps every nav item reachable by its accessible name', () => {
      renderCollapsed()

      for (const label of [
        'Hoy',
        'Planificador',
        'Materias',
        'Horario',
        'Entregas',
        'Carreras',
        'Ajustes',
        'Exportar datos'
      ]) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
      }
    })

    it('still navigates from the rail', () => {
      const onNavigate = vi.fn()
      renderCollapsed({ onNavigate })

      fireEvent.click(screen.getByRole('button', { name: 'Horario' }))

      expect(onNavigate).toHaveBeenCalledWith('horario')
    })

    it('offers "Desplegar barra lateral" and calls onToggleCollapsed', () => {
      const onToggleCollapsed = vi.fn()
      renderCollapsed({ onToggleCollapsed })

      const toggle = screen.getByRole('button', { name: 'Desplegar barra lateral' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(toggle)

      expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
    })
  })

  it('offers "Replegar barra lateral" while expanded', () => {
    const onToggleCollapsed = vi.fn()
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      />
    )

    const toggle = screen.getByRole('button', { name: 'Replegar barra lateral' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  // The window, not the user, is the one refusing here — so the control stays
  // visible and disabled instead of disappearing and looking like a bug.
  it('disables the toggle when the window is too narrow to expand', () => {
    render(
      <Sidebar
        active="hoy"
        onNavigate={vi.fn()}
        onExport={vi.fn()}
        collapsed
        onToggleCollapsed={vi.fn()}
        canToggle={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Desplegar barra lateral' })).toBeDisabled()
  })
})
