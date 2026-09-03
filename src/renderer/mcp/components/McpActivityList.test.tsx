// @vitest-environment jsdom
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { McpAuditEntry } from '../../../shared/ipc/mcp'
import { McpActivityList } from './McpActivityList'

// mcp-app-control task 18.3 — approved `.pen` design, node `OZBa5`'s
// "Últimas operaciones" card. Newest-first is proven by PASSING the fixtures
// already in that order and asserting the rendered order matches, not by any
// sorting this component would have to get right.
const successEntry: McpAuditEntry = {
  id: 3,
  occurredAt: '2026-09-03T14:32:00.000Z',
  tool: 'materias_create',
  slice: 'materias',
  action: 'write',
  outcome: 'success',
  summary: 'materias#57 creada',
  clientName: 'claude-code',
  errorCode: null
}

const deniedEntry: McpAuditEntry = {
  id: 2,
  occurredAt: '2026-09-03T14:20:00.000Z',
  tool: 'carreras_delete',
  slice: 'carreras',
  action: 'write',
  outcome: 'denied',
  summary: 'carreras: falta permiso de escritura',
  clientName: 'claude-code',
  errorCode: 'PERMISSION_DENIED'
}

const authFailedEntry: McpAuditEntry = {
  id: 1,
  occurredAt: '2026-09-03T14:10:00.000Z',
  tool: null,
  slice: null,
  action: null,
  outcome: 'auth-failed',
  summary: 'token faltante o inválido',
  clientName: null,
  errorCode: 'UNAUTHORIZED'
}

describe('McpActivityList', () => {
  it('shows the empty-state copy when there is no activity yet', () => {
    render(<McpActivityList entries={[]} />)

    expect(screen.getByText('Todavía no hay operaciones registradas.')).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-activity-row')).not.toBeInTheDocument()
  })

  it("renders one row per entry, in the exact order it was given (newest-first is the caller's job)", () => {
    render(<McpActivityList entries={[successEntry, deniedEntry, authFailedEntry]} />)

    const rows = screen.getAllByTestId('mcp-activity-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('materias_create')
    expect(rows[1]).toHaveTextContent('carreras_delete')
    // The auth-failed row has no `tool` — its own fallback copy takes that slot.
    expect(rows[2]).toHaveTextContent('Conexión rechazada')
  })

  it('shows the tool, the summary and the formatted timestamp for a successful call', () => {
    render(<McpActivityList entries={[successEntry]} />)

    expect(screen.getByText('materias_create')).toBeInTheDocument()
    expect(screen.getByText('materias#57 creada')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    // Computed the SAME way the component does, so this assertion stays
    // correct regardless of which timezone the test machine runs in.
    expect(
      screen.getByText(format(parseISO(successEntry.occurredAt), 'd MMM HH:mm', { locale: es }))
    ).toBeInTheDocument()
  })

  // Triangulates the outcome→label mapping across the remaining two chip
  // colors this screen must show (design's outcome chip table).
  it('labels a denied call "Denegado" and a rejected handshake "Auth fallida"', () => {
    render(<McpActivityList entries={[deniedEntry, authFailedEntry]} />)

    expect(screen.getByText('Denegado')).toBeInTheDocument()
    expect(screen.getByText('Auth fallida')).toBeInTheDocument()
  })

  it('shows the connection-rejected fallback when a row carries no tool (auth-failed)', () => {
    render(<McpActivityList entries={[authFailedEntry]} />)

    expect(screen.getByText('Conexión rechazada')).toBeInTheDocument()
    expect(screen.getByText('token faltante o inválido')).toBeInTheDocument()
  })
})
