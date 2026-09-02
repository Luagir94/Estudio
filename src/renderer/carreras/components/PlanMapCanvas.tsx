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
 * x-step 170 and y-step 84, and connector `Y3s57` is 2px tall with its elbow
 * 16px past the box's right edge.
 */
const BOX_WIDTH = 138
const BOX_HEIGHT = 58
const COLUMN_STEP = 170
const ROW_STEP = 84
const ELBOW_OFFSET = 16
/** Room above the first row for the column headings (`AyW4K` sits at y: 2). */
const HEADER_HEIGHT = 26
const CONNECTOR_THICKNESS = 2

export type PlanMapBoxState = 'aprobada' | 'enBorrador' | 'habilitada' | 'bloqueada'

export interface PlanMapBox {
  id: number
  name: string
  /** Second line: the code, plus whatever the state makes worth saying. */
  meta: string
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
// leave nothing louder for something that actually went wrong. Its reason line
// is where the colour goes.
const STATE_STYLES: Record<PlanMapBoxState, string> = {
  aprobada: 'border-(--color-ok) bg-(--color-ok-soft)',
  enBorrador: 'border-primary bg-brand-soft',
  habilitada: 'border-primary bg-card',
  bloqueada: 'border-border bg-card opacity-55'
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

const META_STYLES: Record<PlanMapBoxState, string> = {
  aprobada: 'text-(--color-ok)',
  enBorrador: 'text-primary-ink',
  habilitada: 'text-muted-foreground',
  bloqueada: 'text-destructive'
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
  const elbowX = startX + ELBOW_OFFSET
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
  function renderBox(box: PlanMapBox, style: React.CSSProperties): React.JSX.Element {
    const content = (
      <>
        <span
          className={cn(
            'text-body-sm font-semibold leading-tight',
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
          'flex items-center gap-1.5 overflow-hidden rounded-lg border p-2',
          STATE_STYLES[box.state],
          box.id === selectedId && SELECTED_RING
        )}
      >
        {onSelect === undefined ? (
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">{content}</div>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(box.id)}
            aria-pressed={box.id === selectedId}
            // "Seleccionar", not "Abrir": on the map a click INSPECTS the
            // materia in the rail. Opening it is a link inside that panel.
            aria-label={t('planMap.selectSubject', { subject: box.name })}
            className={cn('flex min-w-0 flex-1 flex-col gap-[3px] text-left', interactive)}
          >
            {content}
          </button>
        )}
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
          return renderBox(box, {
            position: 'absolute',
            left: columnX(node.column),
            top: rowY(node.row),
            width: BOX_WIDTH,
            height: BOX_HEIGHT
          })
        })}
      </div>
    </div>
  )
}
