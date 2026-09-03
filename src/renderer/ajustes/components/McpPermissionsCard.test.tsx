// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { McpPermission } from '../../../shared/ipc/mcp'
import { McpPermissionsCard } from './McpPermissionsCard'

// Approved `.pen` design, node `J8kVj` "Card — Permisos MCP" (mcp-app-control
// task 16.1). Grants default to NONE (spec "Grants default to NONE per slice
// (fail closed)") — every test below that does not explicitly grant a slice
// proves the toggle renders OFF, not merely that it exists.
const NONE_PERMISSIONS: McpPermission[] = [
  { slice: 'materias', canRead: false, canWrite: false },
  { slice: 'carreras', canRead: false, canWrite: false },
  { slice: 'entregas', canRead: false, canWrite: false },
  { slice: 'fechas', canRead: false, canWrite: false },
  { slice: 'parciales', canRead: false, canWrite: false },
  { slice: 'finales', canRead: false, canWrite: false },
  { slice: 'clases', canRead: false, canWrite: false },
  { slice: 'horario', canRead: false, canWrite: false }
]

function renderCard(overrides: Partial<ComponentProps<typeof McpPermissionsCard>> = {}) {
  const onChangePermission = vi.fn()
  const onViewActivity = vi.fn()
  render(
    <McpPermissionsCard
      permissions={NONE_PERMISSIONS}
      onChangePermission={onChangePermission}
      pendingSlice={null}
      onViewActivity={onViewActivity}
      {...overrides}
    />
  )
  return { onChangePermission, onViewActivity }
}

describe('McpPermissionsCard', () => {
  it('shows the title, description and every fresh-install toggle OFF', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Permisos MCP' })).toBeInTheDocument()
    expect(screen.getByText('Qué puede tocar un CLI conectado · todo empieza en ninguno')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /^(Leer|Escribir)$/ })) {
      expect(button).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('shows all 8 curated slices with their exact tool-count copy', () => {
    renderCard()

    expect(within(screen.getByRole('group', { name: 'Materias' })).getByText('Materias')).toBeInTheDocument()
    expect(screen.getByText('6 herramientas · crear, editar, borrar, nota final')).toBeInTheDocument()
    expect(screen.getByText('8 herramientas · carreras y períodos')).toBeInTheDocument()
    expect(screen.getByText('5 herramientas · crear, editar, marcar hecha, borrar')).toBeInTheDocument()
    expect(screen.getByText('4 herramientas · crear, editar, borrar', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('2 herramientas · solo asistencia')).toBeInTheDocument()
    expect(screen.getByText('1 herramienta · solo lectura')).toBeInTheDocument()
  })

  // The one thing easy to get wrong, plus the two the mission's own catalog
  // audit surfaced beyond it: a toggle that grants nothing must never render.
  // Read-capable: materias, carreras, entregas, fechas, horario = 5.
  // Write-capable: materias, carreras, entregas, fechas, clases, parciales,
  // finales = 7.
  it('renders exactly one toggle for a slice with only one real capability, none for the other', () => {
    renderCard()

    expect(within(screen.getByRole('group', { name: 'Clases' })).queryByRole('button', { name: 'Leer' })).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Clases' })).getByRole('button', { name: 'Escribir' })
    ).toBeInTheDocument()

    expect(
      within(screen.getByRole('group', { name: 'Horario' })).queryByRole('button', { name: 'Escribir' })
    ).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Horario' })).getByRole('button', { name: 'Leer' })
    ).toBeInTheDocument()

    // Parciales/finales: the real catalog (task 16's own capability audit)
    // has no read tool for either, despite the approved design's row copy
    // pairing them with read+write elsewhere.
    expect(within(screen.getByRole('group', { name: 'Parciales' })).queryByRole('button', { name: 'Leer' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Finales' })).queryByRole('button', { name: 'Leer' })).toBeNull()

    expect(screen.getAllByRole('button', { name: 'Leer' })).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: 'Escribir' })).toHaveLength(7)
  })

  it('reflects an existing grant as a pressed toggle, independent of its sibling', () => {
    renderCard({
      permissions: NONE_PERMISSIONS.map((p) => (p.slice === 'materias' ? { ...p, canRead: true } : p))
    })

    const materiasGroup = screen.getByRole('group', { name: 'Materias' })
    expect(within(materiasGroup).getByRole('button', { name: 'Leer' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(materiasGroup).getByRole('button', { name: 'Escribir' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggling read calls onChangePermission with only read flipped, write preserved', async () => {
    const user = userEvent.setup()
    const { onChangePermission } = renderCard({
      permissions: NONE_PERMISSIONS.map((p) => (p.slice === 'entregas' ? { ...p, canWrite: true } : p))
    })

    await user.click(within(screen.getByRole('group', { name: 'Entregas' })).getByRole('button', { name: 'Leer' }))

    expect(onChangePermission).toHaveBeenCalledWith({ slice: 'entregas', canRead: true, canWrite: true })
  })

  it('toggling write calls onChangePermission with only write flipped, read preserved', async () => {
    const user = userEvent.setup()
    const { onChangePermission } = renderCard({
      permissions: NONE_PERMISSIONS.map((p) => (p.slice === 'fechas' ? { ...p, canRead: true } : p))
    })

    await user.click(within(screen.getByRole('group', { name: 'Fechas' })).getByRole('button', { name: 'Escribir' }))

    expect(onChangePermission).toHaveBeenCalledWith({ slice: 'fechas', canRead: true, canWrite: true })
  })

  // Clicking an already-ON toggle withdraws it — the spec's own "revoke mid
  // session" scenario starts exactly here, from this card.
  it('toggling an already-granted permission off calls onChangePermission with it cleared', async () => {
    const user = userEvent.setup()
    const { onChangePermission } = renderCard({
      permissions: NONE_PERMISSIONS.map((p) => (p.slice === 'clases' ? { ...p, canWrite: true } : p))
    })

    await user.click(within(screen.getByRole('group', { name: 'Clases' })).getByRole('button', { name: 'Escribir' }))

    expect(onChangePermission).toHaveBeenCalledWith({ slice: 'clases', canRead: false, canWrite: false })
  })

  it('shows how many of the 8 slices have any grant at all', () => {
    renderCard({
      permissions: NONE_PERMISSIONS.map((p) =>
        p.slice === 'materias' || p.slice === 'horario' ? { ...p, canRead: true } : p
      )
    })

    expect(screen.getByText('2 de 8 concedidos')).toBeInTheDocument()
  })

  it('shows zero granted on a fresh install', () => {
    renderCard()

    expect(screen.getByText('0 de 8 concedidos')).toBeInTheDocument()
  })

  it('shows the exact verbatim write-access warning', () => {
    renderCard()

    expect(
      screen.getByText(
        'Con Escribir, un CLI conectado puede crear, editar y BORRAR tus registros sin preguntarte nada. Concedé solo lo que ese CLI necesite.'
      )
    ).toBeInTheDocument()
  })

  // PR16 shipped this card with "Ver actividad" deliberately absent — the
  // /mcp/actividad route it points to did not exist yet. PR18 registers that
  // route and this is the button that reaches it, in the same head-right
  // pill group the approved `.pen` always drew it in.
  it('calls onViewActivity when "Ver actividad" is pressed', async () => {
    const user = userEvent.setup()
    const { onViewActivity } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Ver actividad' }))

    expect(onViewActivity).toHaveBeenCalledTimes(1)
  })

  it('disables only the pending slice’s own toggles while its mutation is in flight', () => {
    renderCard({ pendingSlice: 'materias' })

    const materiasGroup = screen.getByRole('group', { name: 'Materias' })
    expect(within(materiasGroup).getByRole('button', { name: 'Leer' })).toBeDisabled()
    expect(within(materiasGroup).getByRole('button', { name: 'Escribir' })).toBeDisabled()

    const carrerasGroup = screen.getByRole('group', { name: 'Carreras' })
    expect(within(carrerasGroup).getByRole('button', { name: 'Leer' })).toBeEnabled()
    expect(within(carrerasGroup).getByRole('button', { name: 'Escribir' })).toBeEnabled()
  })
})
