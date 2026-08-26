// Presentational (approved design): the APUNTES DE CLASE section of the
// subject detail's left column, between NOTAS and ADJUNTOS.
//
// Molded on the PARCIALES section directly above the NOTAS field — same
// heading step, same row surface — with ONE deliberate difference: there is
// no add button. An apunte belongs to a class, so it is created from the
// class (Hoy's ClassRow, a Horario block); a "+ Agregar apunte" here would
// have to ask which class it was, which is the one question the surface it
// came from already answered.
//
// The row body is a BUTTON, the same additive affordance the parciales and
// entregas rows already document: it is the way into the markdown editor,
// which is where an apunte is read, written and deleted.
import { Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClassNoteRecord } from '../../../shared/ipc/materias'
import { formatClassDayMonth } from '../domain/classDate'
import { cn } from '../../shared/lib/cn'
import { interactiveSurface } from '../../shared/lib/interactive'

interface ApuntesSectionProps {
  notes: ClassNoteRecord[]
  /** Opens that apunte in the markdown editor — the ONE surface allowed to write its text. */
  onOpenApunte: (noteId: number) => void
}

export function ApuntesSection({ notes, onOpenApunte }: ApuntesSectionProps): React.JSX.Element {
  const { t } = useTranslation('clases')
  // Newest first. An apunte is read to remember the LAST class, not the first
  // one of the cuatrimestre — and ISO dates sort chronologically as strings,
  // so no parsing is needed (same precedent as `periodsOverlap`).
  const orderedNotes = [...notes].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <section className="flex w-full flex-col gap-2">
      <h3 className="text-label font-semibold text-muted-foreground">{t('apuntesSection.heading')}</h3>

      {orderedNotes.length === 0 && <p className="text-body-lg text-muted-foreground">{t('apuntesSection.empty')}</p>}

      {orderedNotes.map((note) => (
        // No `aria-label`: the row's own content — the date plus the apunte —
        // is a better accessible name than any label could be, and an
        // aria-label would REPLACE it with something less useful.
        <button
          key={note.id}
          type="button"
          data-testid="subject-detail-apunte"
          onClick={() => onOpenApunte(note.id)}
          className={cn(
            'flex w-full items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-left',
            interactiveSurface
          )}
        >
          <span className="flex w-[70px] shrink-0 items-center gap-2 text-body-sm">
            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-secondary-foreground">{formatClassDayMonth(note.date)}</span>
          </span>

          {/* One line, clipped: the section is an index of classes, and the
              full apunte is one click away in the dialog that owns it. */}
          <span className="min-w-0 flex-1 truncate text-body-sm text-secondary-foreground">{note.preview}</span>
        </button>
      ))}
    </section>
  )
}
