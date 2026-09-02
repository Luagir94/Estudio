// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { layOutPlanMap } from '../domain/planMap'
import { PlanMapCanvas, type PlanMapBox } from './PlanMapCanvas'

const SUBJECTS = [
  { id: 1, nivel: 1 },
  { id: 2, nivel: 1 },
  { id: 3, nivel: 2 },
  { id: 4, nivel: null }
]

const EDGES = [{ subjectId: 3, requiresSubjectId: 1 }]

const BOXES: PlanMapBox[] = [
  { id: 1, name: 'Introducción al Derecho', meta: 'DER-101 · Aprobada', state: 'aprobada' },
  { id: 2, name: 'Derecho Romano', meta: 'DER-102 · 4 h · Mar', state: 'habilitada' },
  { id: 3, name: 'Derecho Civil II', meta: 'Falta Introducción al Derecho aprobada', state: 'bloqueada' },
  { id: 4, name: 'Seminario de Ética', meta: 'ETI-201', state: 'habilitada' }
]

function renderCanvas(overrides: Partial<Parameters<typeof PlanMapCanvas>[0]> = {}) {
  const layout = layOutPlanMap(SUBJECTS, EDGES)
  return render(<PlanMapCanvas layout={layout} boxes={BOXES} edges={EDGES} {...overrides} />)
}

describe('PlanMapCanvas', () => {
  it('renders one box per materia placed in the plan', () => {
    renderCanvas()

    expect(screen.getByText('Introducción al Derecho')).toBeInTheDocument()
    expect(screen.getByText('Derecho Romano')).toBeInTheDocument()
    expect(screen.getByText('Derecho Civil II')).toBeInTheDocument()
  })

  // The user rejected "nivel" as UI copy outright: the columns are an order, so
  // the heading is the position and nothing else.
  it('labels columns with bare numbers and never the word nivel', () => {
    const { container } = renderCanvas()

    const headings = within(screen.getByTestId('plan-map-columns')).getAllByTestId('plan-map-column-heading')
    expect(headings.map((heading) => heading.textContent)).toEqual(['1', '2'])
    expect(container.textContent).not.toMatch(/nivel/i)
  })

  // A blocked box says what is missing right where the student reads it. The
  // badge/lock/red-line triple of the old planificador is deliberately gone.
  it('shows the missing requirement on a blocked materia', () => {
    renderCanvas()

    expect(screen.getByText('Falta Introducción al Derecho aprobada')).toBeInTheDocument()
  })

  it('draws one connector per correlativa between placed materias', () => {
    const { container } = renderCanvas()

    expect(container.querySelectorAll('[data-testid="plan-map-connector"]').length).toBeGreaterThan(0)
  })

  it('calls onSelect with the materia that was clicked', async () => {
    const onSelect = vi.fn()
    renderCanvas({ onSelect })

    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar Derecho Romano' }))

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('renders plain boxes with no button role when there is nothing to open', () => {
    renderCanvas()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('tells the student the carrera has nothing to map yet', () => {
    render(<PlanMapCanvas layout={layOutPlanMap([], [])} boxes={[]} edges={[]} />)

    expect(screen.getByText('Esta carrera todavía no tiene materias para mapear.')).toBeInTheDocument()
  })
})

// The `+` is not a shortcut bolted onto the box — it is the availability
// signal. Only a habilitada can be added, so the boxes carrying one are exactly
// the boxes you can act on, with no colour to decode.
describe('PlanMapCanvas — adding to the borrador', () => {
  const STATES: PlanMapBox[] = [
    { id: 1, name: 'Introducción al Derecho', meta: 'DER-101 · Aprobada', state: 'aprobada' },
    { id: 2, name: 'Derecho Romano', meta: 'DER-102', state: 'habilitada' },
    { id: 3, name: 'Derecho Civil II', meta: 'Falta Introducción al Derecho aprobada', state: 'bloqueada' },
    { id: 4, name: 'Seminario de Ética', meta: 'ETI-201 · En tu borrador', state: 'enBorrador' }
  ]
  const layout = layOutPlanMap(
    [
      { id: 1, nivel: 1 },
      { id: 2, nivel: 1 },
      { id: 3, nivel: 2 },
      { id: 4, nivel: 2 }
    ],
    []
  )

  it('offers the + on habilitadas and on nothing else', () => {
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onAdd={vi.fn()} />)

    const adds = screen.getAllByTestId('plan-map-add')
    expect(adds).toHaveLength(1)
    expect(adds[0]).toHaveAccessibleName('Agregar Derecho Romano al borrador')
  })

  it('adds the materia that was chosen', async () => {
    const onAdd = vi.fn()
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: 'Agregar Derecho Romano al borrador' }))

    expect(onAdd).toHaveBeenCalledWith(2)
  })

  // Selecting the materia and adding it are different intentions, so a click on
  // one must never fire the other.
  it('keeps selecting and adding apart', async () => {
    const onAdd = vi.fn()
    const onSelect = vi.fn()
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onAdd={onAdd} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar Derecho Romano' }))
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(onAdd).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Agregar Derecho Romano al borrador' }))
    expect(onAdd).toHaveBeenCalledWith(2)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('offers no + at all when there is nowhere to add', () => {
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} />)

    expect(screen.queryByTestId('plan-map-add')).not.toBeInTheDocument()
  })
})

// One rule, both directions: the box's button is whatever you can do with that
// materia right now. `+` if you can cursar it, `×` if you already planned it,
// nothing if it is aprobada or bloqueada.
describe('PlanMapCanvas — leaving the borrador', () => {
  const STATES: PlanMapBox[] = [
    { id: 1, name: 'Introducción al Derecho', meta: 'DER-101 · Aprobada', state: 'aprobada' },
    { id: 2, name: 'Derecho Romano', meta: 'DER-102', state: 'habilitada' },
    { id: 3, name: 'Derecho Penal I', meta: 'DER-202 · En tu borrador', state: 'enBorrador' },
    { id: 4, name: 'Derecho Civil II', meta: 'Falta Civil I aprobada', state: 'bloqueada' }
  ]
  const layout = layOutPlanMap(
    [
      { id: 1, nivel: 1 },
      { id: 2, nivel: 1 },
      { id: 3, nivel: 2 },
      { id: 4, nivel: 2 }
    ],
    []
  )

  it('offers the × on the drafted materia and on nothing else', () => {
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)

    const removes = screen.getAllByTestId('plan-map-remove')
    expect(removes).toHaveLength(1)
    expect(removes[0]).toHaveAccessibleName('Quitar Derecho Penal I del borrador')
  })

  it('never offers both buttons on the same box', () => {
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getAllByTestId('plan-map-add')).toHaveLength(1)
    expect(screen.getAllByTestId('plan-map-remove')).toHaveLength(1)
    expect(screen.getAllByTestId('plan-map-add')[0]).toHaveAccessibleName('Agregar Derecho Romano al borrador')
  })

  it('removes the materia that was chosen', async () => {
    const onRemove = vi.fn()
    render(<PlanMapCanvas layout={layout} boxes={STATES} edges={[]} onRemove={onRemove} />)

    await userEvent.click(screen.getByRole('button', { name: 'Quitar Derecho Penal I del borrador' }))

    expect(onRemove).toHaveBeenCalledWith(3)
  })
})

// On the map a click SELECTS: you are planning, not browsing, and leaving the
// canvas to add one correlativa loses the picture you came here to read.
describe('PlanMapCanvas — selection', () => {
  const layout = layOutPlanMap(SUBJECTS, EDGES)

  it('names the box action as selecting, not opening', () => {
    render(<PlanMapCanvas layout={layout} boxes={BOXES} edges={EDGES} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Seleccionar Derecho Romano' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir Derecho Romano' })).not.toBeInTheDocument()
  })

  it('marks only the selected box as pressed', () => {
    render(<PlanMapCanvas layout={layout} boxes={BOXES} edges={EDGES} onSelect={vi.fn()} selectedId={2} />)

    expect(screen.getByRole('button', { name: 'Seleccionar Derecho Romano' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Seleccionar Introducción al Derecho' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('PlanMapCanvas — column headings are the order, not the index', () => {
  it('labels a column with the order it holds, gaps and all', () => {
    const layout = layOutPlanMap(
      [
        { id: 1, nivel: 1 },
        { id: 2, nivel: 3 }
      ],
      []
    )

    render(<PlanMapCanvas layout={layout} boxes={BOXES} edges={[]} />)

    const headings = screen.getAllByTestId('plan-map-column-heading')
    // Two columns, adjacent on the canvas — but labelled 1 and 3, because that
    // is what the student wrote.
    expect(headings.map((heading) => heading.textContent)).toEqual(['1', '3'])
  })

  it('still numbers a contiguous plan the obvious way', () => {
    const layout = layOutPlanMap(
      [
        { id: 1, nivel: 1 },
        { id: 2, nivel: 2 }
      ],
      []
    )

    render(<PlanMapCanvas layout={layout} boxes={BOXES} edges={[]} />)

    expect(screen.getAllByTestId('plan-map-column-heading').map((h) => h.textContent)).toEqual(['1', '2'])
  })
})

// The defect this fixes, measured rather than eyeballed: an edge that skips a
// column used to run straight at the target's row, driving it through whatever
// box sat between. Three boxes in a line with a rule through them read as a
// chain — you could not tell what connected to what.
describe('PlanMapCanvas — what a connector says about its correlativa', () => {
  const subjects = [
    { id: 1, nivel: 1 },
    { id: 2, nivel: 1 },
    { id: 3, nivel: 2 },
    { id: 4, nivel: 2 }
  ]
  const edges = [
    { subjectId: 3, requiresSubjectId: 1 },
    { subjectId: 3, requiresSubjectId: 2 },
    { subjectId: 4, requiresSubjectId: 2 }
  ]
  const boxes: PlanMapBox[] = [
    { id: 1, name: 'Paradigmas', meta: 'PAR · Aprobada', state: 'aprobada' },
    { id: 2, name: 'Sintaxis', meta: 'SIN', state: 'habilitada' },
    { id: 3, name: 'Gestión de Datos', meta: 'GDD · En tu borrador', state: 'enBorrador' },
    { id: 4, name: 'Diseño de Sistemas', meta: 'DDS', state: 'habilitada' }
  ]

  function connectorsByState(container: HTMLElement, state: string): Element[] {
    return [...container.querySelectorAll(`[data-testid="plan-map-connector"][data-state="${state}"]`)]
  }

  function renderColoured() {
    return render(<PlanMapCanvas layout={layOutPlanMap(subjects, edges)} boxes={boxes} edges={edges} />)
  }

  it('lights the correlativa whose prerequisite is already aprobada', () => {
    const { container } = renderColoured()

    const met = connectorsByState(container, 'cumplida')
    expect(met.length).toBeGreaterThan(0)
    expect(met.every((segment) => segment.className.includes('bg-(--color-ok)'))).toBe(true)
  })

  it('leaves a correlativa nobody has met yet on the border colour', () => {
    const { container } = renderColoured()

    const pending = connectorsByState(container, 'pendiente')
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.every((segment) => segment.className.includes('bg-border'))).toBe(true)
  })

  // The borrador is NOT a reason to paint a line. Edge 2 → 3 ends in a drafted
  // materia and edge 1 → 3 starts in an aprobada one, and only the second is
  // lit: what the colour reports is whether the requirement is MET, and putting
  // a subject in the borrador does not meet anything.
  it('never paints a line for a correlativa the borrador merely touches', () => {
    const { container } = renderColoured()

    const states = [...container.querySelectorAll('[data-testid="plan-map-connector"]')].map((segment) =>
      segment.getAttribute('data-state')
    )
    expect(new Set(states)).toEqual(new Set(['cumplida', 'pendiente']))

    // 1 → 3 is the only edge leaving an aprobada, so every lit segment belongs
    // to it — and 2 → 3, which ends in the same drafted box, stays dim.
    const litEdges = new Set(
      [...container.querySelectorAll('[data-testid="plan-map-connector"][data-state="cumplida"]')].map((segment) =>
        segment.getAttribute('data-edge')
      )
    )
    expect([...litEdges]).toEqual(['1-3'])
  })
})

describe('PlanMapCanvas — an edge that skips a column', () => {
  // Geometry from the approved `.pen`, mirrored by the component's constants.
  const BOX_WIDTH = 138
  const BOX_HEIGHT = 58
  const COLUMN_STEP = 170
  const ROW_STEP = 84
  const HEADER_HEIGHT = 26

  function rects(container: HTMLElement, testId: string) {
    return [...container.querySelectorAll(`[data-testid="${testId}"]`)].map((node) => {
      const { left, top, width, height } = (node as HTMLElement).style
      return { left: parseFloat(left), top: parseFloat(top), width: parseFloat(width), height: parseFloat(height) }
    })
  }

  function boxAt(column: number, row: number) {
    return {
      left: column * COLUMN_STEP,
      top: HEADER_HEIGHT + row * ROW_STEP,
      width: BOX_WIDTH,
      height: BOX_HEIGHT
    }
  }

  const overlaps = (
    a: { left: number; top: number; width: number; height: number },
    b: { left: number; top: number; width: number; height: number }
  ) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top

  // The line IS the verdict on the correlativa it draws. A prerequisite that is
  // already aprobada makes it met, and a met requirement that reads the same
  // grey as an unmet one tells the student nothing.
  it('never draws a connector across a box', () => {
    // 1 requires nothing, 2 requires 1, 3 requires 2 AND 1 — that last edge
    // spans two columns and must get out of the way of the middle box.
    const subjects = [
      { id: 1, nivel: null },
      { id: 2, nivel: null },
      { id: 3, nivel: null }
    ]
    const edges = [
      { subjectId: 2, requiresSubjectId: 1 },
      { subjectId: 3, requiresSubjectId: 2 },
      { subjectId: 3, requiresSubjectId: 1 }
    ]
    const boxes: PlanMapBox[] = subjects.map((subject) => ({
      id: subject.id,
      name: `Materia ${subject.id}`,
      meta: 'COD',
      state: 'habilitada'
    }))

    const { container } = render(<PlanMapCanvas layout={layOutPlanMap(subjects, edges)} boxes={boxes} edges={edges} />)

    const connectors = rects(container, 'plan-map-connector')
    expect(connectors.length).toBeGreaterThan(0)

    const drawnBoxes = [boxAt(0, 0), boxAt(1, 0), boxAt(2, 0)]
    const crossings = connectors.filter((connector) => drawnBoxes.some((box) => overlaps(connector, box)))
    expect(crossings).toEqual([])
  })
})
