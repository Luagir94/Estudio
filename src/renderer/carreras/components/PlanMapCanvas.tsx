// Presentational (design §4, approved `.pen` node `jZOtu` — the "Plan de
// estudios" tab of a carrera). Every verdict arrives as a prop: the layout is
// resolved by the pure domain (`domain/planMap.ts`) and each box's state and
// copy are built by the container. This file only decides how they look.
//
// Two behaviours worth stating out loud, because both are easy to "fix" into a
// bug:
//
// THE COLUMN HEADINGS ARE BARE NUMBERS. `nivel` is the name of the stored
// column, not a word the student ever reads. The tray below the rule says "SIN
// ORDENAR", never "sin nivel asignado".
//
// THE MAP NEVER REFLOWS. A column IS the order; moving one to another row would
// be a lie. It scrolls inside its own frame instead — the same exception the
// Horario already holds in the design's layout rules ("< 820 px: … los 7 días
// scrollean DENTRO de la grilla, nunca la página").
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../shared/lib/cn'
import { interactive } from '../../shared/lib/interactive'
import type { PlanMapEdge, PlanMapLayout } from '../domain/planMap'

/**
 * Geometry, straight from the approved `.pen`: box `B557g9` is 138×58 at
 * x-step 170 and y-step 84, and connector `Y3s57` is 2px tall.
 */
const BOX_WIDTH = 138
const BOX_HEIGHT = 58
const COLUMN_STEP = 170
const ROW_STEP = 84
/**
 * Where a line turns, measured from the right edge of the box it leaves.
 *
 * NOT one shared offset. Every line out of a column used to elbow at the same
 * x, so the vertical stretches of unrelated correlativas stacked onto one
 * column of pixels and read as a single bar running the height of the map —
 * you could see that something connected, never what. The lane is picked by
 * the ROW the line leaves from, which separates unrelated lines while keeping
 * the ones from the same materia together on one trunk, because those really
 * do share an origin.
 */
const ELBOW_LANE_START = 7
const ELBOW_LANE_STEP = 6
/** Room above the first row for the column headings (`AyW4K` sits at y: 2). */
const HEADER_HEIGHT = 26
const CONNECTOR_THICKNESS = 2

export type PlanMapBoxState = 'aprobada' | 'enBorrador' | 'habilitada' | 'bloqueada'

export interface PlanMapBox {
  id: number
  name: string
  /** Second line: the code, plus whatever the state makes worth saying. */
  meta: string
  /**
   * What is missing, for a materia that cannot be cursada yet. Off the box on
   * purpose — see `renderReason` — and omitted whenever nothing is missing, so
   * a box that is merely available carries no description to read.
   */
  reason?: string
  state: PlanMapBoxState
}

interface PlanMapCanvasProps {
  layout: PlanMapLayout
  boxes: readonly PlanMapBox[]
  edges: readonly PlanMapEdge[]
  /** Omitted when there is nothing to open — the boxes then carry no button role. */
  onSelect?: (subjectId: number) => void
  /** Omitted and no box offers a `+`, however available the materia is. */
  onAdd?: (subjectId: number) => void
  /** Omitted and a drafted box offers no way back out. */
  onRemove?: (subjectId: number) => void
  /** The materia the rail is currently inspecting. */
  selectedId?: number | null
}

// `bloqueada` dims rather than reddens: not being able to cursar something yet
// is the normal state of most of a plan, and spending `urgent` on it would
// leave nothing louder for something that actually went wrong. The tooltip's
// dot is the only place that colour is spent.
const STATE_STYLES: Record<PlanMapBoxState, string> = {
  aprobada: 'border-(--color-ok) bg-(--color-ok-soft)',
  enBorrador: 'border-primary bg-brand-soft',
  habilitada: 'border-primary bg-card',
  // It comes back to full strength while its tooltip is open, which is the
  // state the `.pen` captures. Reading the reason and squinting at the box it
  // belongs to at 55% are the same moment, and only one of them should be dim.
  // `hover:`/`focus-within:`, not `group-*`: this class lands ON the element
  // that CARRIES `group`, and those variants only ever match descendants.
  bloqueada: 'border-border bg-card opacity-55 hover:opacity-100 focus-within:opacity-100'
}

// Selection cannot reuse a state colour — `brand-soft` already means "en
// borrador" — so it reaches for the brighter brand INK and a second pixel of
// stroke. One pixel alone was not legible across a map of eighteen boxes.
const SELECTED_RING = 'border-2 border-primary-ink'

/** Button `tBKFb` from the `.pen`: 22×22, radius 6, icon 14, centred. */
const ACTION_BUTTON = 'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-primary-ink'

/**
 * What one line says about the correlativa it draws — and it says ONE thing:
 * whether that requirement is met.
 *
 * There is deliberately NO third state for "this line touches the borrador".
 * Drafting a materia meets no requirement, so painting its lines announces
 * progress the student has not made — and the borrador is already legible on
 * the boxes themselves. Colour on a line is spent on the one fact that earns
 * it, which is what keeps a map of eighteen boxes readable at a glance.
 */
type PlanMapConnectorState = 'cumplida' | 'pendiente'

// `--color-ok` is the same green the aprobada box already wears, so the line
// agrees with the box it leaves instead of introducing a third colour.
const CONNECTOR_STYLES: Record<PlanMapConnectorState, string> = {
  cumplida: 'bg-(--color-ok)',
  pendiente: 'bg-border'
}

// `bloqueada` reads muted, not destructive: this line is the materia's CODE
// now, the same as on any other box, and a code printed in the app's alarm
// colour would announce a problem the code itself is not.
const META_STYLES: Record<PlanMapBoxState, string> = {
  aprobada: 'text-(--color-ok)',
  enBorrador: 'text-primary-ink',
  habilitada: 'text-muted-foreground',
  bloqueada: 'text-muted-foreground'
}

/** Ties a box's button to its tooltip through `aria-describedby`. */
function reasonId(subjectId: number): string {
  return `plan-map-reason-${subjectId}`
}

function columnX(column: number): number {
  return column * COLUMN_STEP
}

function rowY(row: number): number {
  return HEADER_HEIGHT + row * ROW_STEP
}

/** The empty band between two rows of boxes, and between two columns. */
const ROW_GAP = ROW_STEP - BOX_HEIGHT
const COLUMN_GAP = COLUMN_STEP - BOX_WIDTH

/**
 * How many lanes fit in that band, derived rather than typed: a lane wide
 * enough to reach the next column would put a rule through a box, so the count
 * has to follow the geometry if the geometry ever moves. Rows beyond the last
 * lane wrap around, which is harmless — two rows that far apart have no
 * vertical stretch in common to collide over.
 */
const ELBOW_LANES = Math.max(1, Math.floor((COLUMN_GAP - ELBOW_LANE_START - CONNECTOR_THICKNESS) / ELBOW_LANE_STEP) + 1)

/**
 * One correlativa as orthogonal segments: out of the prerequisite's right edge,
 * across to the elbow, down or up, then into the dependent's left edge.
 *
 * Elbows rather than a diagonal because a diagonal reads as an arrow with a
 * direction of travel, while a plan de estudios edge is a dependency. The
 * middle segment is dropped when both boxes share a row, which is the common
 * case once the median sweep has done its work.
 *
 * AN EDGE THAT SKIPS A COLUMN TAKES A LANE. Running it straight at the target's
 * row drives it through whatever box sits between — three boxes in a line with
 * a rule through them read as a chain, so you cannot tell what connects to
 * what. It travels the empty band BETWEEN rows instead, and only rises into the
 * target through the gap between the last column it crosses and the target's.
 */
function connectorSegments(
  from: { column: number; row: number },
  to: { column: number; row: number },
  rowCount: number
): { left: number; top: number; width: number; height: number }[] {
  const startX = columnX(from.column) + BOX_WIDTH
  const elbowX = startX + ELBOW_LANE_START + (from.row % ELBOW_LANES) * ELBOW_LANE_STEP
  const endX = columnX(to.column)
  const startY = rowY(from.row) + BOX_HEIGHT / 2
  const endY = rowY(to.row) + BOX_HEIGHT / 2
  const half = CONNECTOR_THICKNESS / 2

  const horizontal = (left: number, top: number, width: number) => ({
    left,
    top: top - half,
    width: Math.max(width, 0),
    height: CONNECTOR_THICKNESS
  })
  const vertical = (left: number, fromY: number, toY: number) => ({
    left: left - half,
    top: Math.min(fromY, toY),
    width: CONNECTOR_THICKNESS,
    height: Math.abs(toY - fromY)
  })

  if (to.column - from.column <= 1) {
    const segments = [horizontal(startX, startY, elbowX - startX), horizontal(elbowX, endY, endX - elbowX)]
    if (startY !== endY) {
      segments.push(vertical(elbowX, startY, endY))
    }
    return segments
  }

  // The lane below the source row, or above it when the source is on the last
  // row and there is no band below to use.
  const laneY = from.row + 1 < rowCount ? rowY(from.row) + BOX_HEIGHT + ROW_GAP / 2 : rowY(from.row) - ROW_GAP / 2
  // The channel between the target's column and the one before it.
  const riseX = endX - COLUMN_GAP / 2

  return [
    horizontal(startX, startY, elbowX - startX),
    vertical(elbowX, startY, laneY),
    horizontal(elbowX, laneY, riseX - elbowX),
    vertical(riseX, laneY, endY),
    horizontal(riseX, endY, endX - riseX)
  ]
}

export function PlanMapCanvas({
  layout,
  boxes,
  edges,
  onSelect,
  onAdd,
  onRemove,
  selectedId = null
}: PlanMapCanvasProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  const boxById = new Map(boxes.map((box) => [box.id, box]))
  const positionById = new Map(layout.nodes.map((node) => [node.id, node]))

  if (layout.nodes.length === 0) {
    return <p className="text-body-lg text-muted-foreground">{t('planMap.empty')}</p>
  }

  const rowCount = layout.nodes.reduce((highest, node) => Math.max(highest, node.row + 1), 0)
  const canvasWidth = Math.max(layout.columns.length * COLUMN_STEP - (COLUMN_STEP - BOX_WIDTH), BOX_WIDTH)
  const canvasHeight = HEADER_HEIGHT + Math.max(rowCount, 1) * ROW_STEP - (ROW_STEP - BOX_HEIGHT)

  // The box is a SHELL, not a button, because it holds two of them: opening the
  // materia and adding it to the borrador are different intentions, and a
  // <button> inside a <button> is invalid markup besides.
  //
  // The `+` appears ONLY on `habilitada`. An aprobada does not need it, a
  // bloqueada cannot use it, and one already drafted has nothing to add — which
  // turns the affordance into the availability signal: in a map of eighteen
  // boxes, the ones carrying a `+` are exactly the ones you can cursar now, with
  // no colour to decode.
  /**
   * The missing correlativa, as a tooltip hanging off the box.
   *
   * It used to be the box's second line. At 138×58 that meant a name and a
   * full sentence competing for four lines of type, and the name — the thing
   * you are actually scanning for — lost. The box carries its code like every
   * other one now.
   *
   * NOT hover-only. The sentence is a real `role="tooltip"` wired to the box's
   * button with `aria-describedby`, and it opens on focus as well, because a
   * reason that only exists under a mouse pointer does not exist at all for
   * someone on a keyboard or a screen reader — "saving space" must not cost
   * them the information.
   *
   * On the last row it flips ABOVE the box: the canvas scrolls inside its own
   * frame, so a tooltip hanging below the bottom row would open into clipped
   * space.
   */
  function renderReason(box: PlanMapBox, row: number): React.JSX.Element | null {
    if (box.reason === undefined) {
      return null
    }
    const flipped = row === rowCount - 1
    return (
      <span
        role="tooltip"
        id={reasonId(box.id)}
        data-testid="plan-map-reason"
        className={cn(
          'pointer-events-none absolute left-0 z-10 flex w-max max-w-[194px] items-center gap-2',
          'rounded-lg border border-border bg-popover px-2.5 py-1.5',
          'text-[11px] font-semibold text-popover-foreground shadow-[0_4px_16px_#00000073]',
          'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          flipped ? 'bottom-full -mb-[2px]' : 'top-full -mt-[2px]'
        )}
      >
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        {box.reason}
      </span>
    )
  }

  function renderBox(box: PlanMapBox, style: React.CSSProperties, row: number): React.JSX.Element {
    const content = (
      <>
        {/* CAPPED AT TWO LINES. The box height is fixed at 58px, so a third
            line does not make the card taller — it pushes the meta out of it,
            and the code the student identifies the materia by disappears. The
            cap is what makes the box survive ANY name, which widening it never
            could: whatever width is chosen, some carrera has a longer name.
            The full name is still on the button's `aria-label` and in the rail. */}
        <span
          className={cn(
            'line-clamp-2 text-body-sm font-semibold leading-tight',
            box.id === selectedId ? 'text-primary-ink' : 'text-foreground'
          )}
        >
          {box.name}
        </span>
        <span className={cn('text-[9px] leading-tight', META_STYLES[box.state])}>{box.meta}</span>
      </>
    )

    return (
      <div
        key={box.id}
        data-testid="plan-map-box"
        style={style}
        className={cn(
          // `group` so the reason opens on hover or focus anywhere in the box.
          // NOT `overflow-hidden` any more: that clipped the tooltip to the
          // box it hangs off, which is the one place it must not stay.
          // `p-1.5`, not `p-2`: 6px per side is the `.pen`'s padding and it is
          // what buys the two-line name its room. 58px minus 12 leaves 46 for
          // 30 (two lines) + 3 (gap) + 11.25 (meta) = 44.25.
          'group flex items-center gap-1.5 rounded-lg border p-1.5',
          STATE_STYLES[box.state],
          box.id === selectedId && SELECTED_RING
        )}
      >
        {/* `overflow-hidden` lives HERE, not on the shell: the long name still
            has to be clipped to its box, but the tooltip hangs outside it. */}
        {onSelect === undefined ? (
          <div className="flex min-w-0 flex-1 flex-col gap-[3px] overflow-hidden">{content}</div>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(box.id)}
            aria-pressed={box.id === selectedId}
            aria-describedby={box.reason === undefined ? undefined : reasonId(box.id)}
            // "Seleccionar", not "Abrir": on the map a click INSPECTS the
            // materia in the rail. Opening it is a link inside that panel.
            aria-label={t('planMap.selectSubject', { subject: box.name })}
            className={cn('flex min-w-0 flex-1 flex-col gap-[3px] overflow-hidden text-left', interactive)}
          >
            {content}
          </button>
        )}
        {renderReason(box, row)}
        {onAdd !== undefined && box.state === 'habilitada' && (
          <button
            type="button"
            data-testid="plan-map-add"
            onClick={() => onAdd(box.id)}
            aria-label={t('planMap.addToDraft', { subject: box.name })}
            className={cn(ACTION_BUTTON, 'bg-brand-soft', interactive)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {/* `bg-card`, not `bg-brand-soft`: this box is ALREADY brand-soft, so
            the button has to lean on the opposite surface or it disappears into
            its own backing. The two buttons are inverses of each other for that
            reason, not for variety. */}
        {onRemove !== undefined && box.state === 'enBorrador' && (
          <button
            type="button"
            data-testid="plan-map-remove"
            onClick={() => onRemove(box.id)}
            aria-label={t('planMap.removeFromDraft', { subject: box.name })}
            className={cn(ACTION_BUTTON, 'bg-card', interactive)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  return (
    // The frame that scrolls, never the page. `min-w-0` lets it actually shrink
    // inside the flex column instead of pushing the layout wide.
    <div className="min-w-0 overflow-auto">
      <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
        {/* The heading is the ORDER the student typed, never the column's
              index. Empty orders collapse so the map has no blank columns, but
              collapsing the POSITION must not renumber the LABEL: a materia
              saved as 3 sitting under a heading that reads "2" contradicts the
              value in its own form. */}
        <div data-testid="plan-map-columns">
          {layout.columns.map((nivel, column) => (
            <span
              key={nivel}
              data-testid="plan-map-column-heading"
              style={{ left: columnX(column), top: 2, width: BOX_WIDTH }}
              className="absolute text-[10px] font-semibold tracking-[0.06em] text-muted-foreground"
            >
              {nivel}
            </span>
          ))}
        </div>

        {/* Painted before the boxes so the lines sit behind them. */}
        {edges.flatMap((edge) => {
          const from = positionById.get(edge.requiresSubjectId)
          const to = positionById.get(edge.subjectId)
          if (from === undefined || to === undefined || from.column >= to.column) {
            return []
          }
          // Read off the PREREQUISITE's state, never the dependent's: the line
          // reports whether the requirement is satisfied, and only the subject
          // that IS the requirement can settle that.
          const state: PlanMapConnectorState =
            boxById.get(edge.requiresSubjectId)?.state === 'aprobada' ? 'cumplida' : 'pendiente'
          const edgeKey = `${edge.requiresSubjectId}-${edge.subjectId}`
          return connectorSegments(from, to, rowCount).map((segment, index) => (
            <span
              key={`${edgeKey}-${index}`}
              data-testid="plan-map-connector"
              // Which correlativa this segment belongs to, and its verdict. A
              // line is drawn in pieces, so without these the DOM cannot say
              // which line any of them is part of.
              data-edge={edgeKey}
              data-state={state}
              aria-hidden="true"
              style={segment}
              className={cn('absolute', CONNECTOR_STYLES[state])}
            />
          ))
        })}

        {layout.nodes.map((node) => {
          const box = boxById.get(node.id)
          if (box === undefined) {
            return null
          }
          return renderBox(
            box,
            {
              position: 'absolute',
              left: columnX(node.column),
              top: rowY(node.row),
              width: BOX_WIDTH,
              height: BOX_HEIGHT
            },
            node.row
          )
        })}
      </div>
    </div>
  )
}
