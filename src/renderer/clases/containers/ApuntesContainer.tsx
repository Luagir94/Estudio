// Container (design §4): the APUNTES DE CLASE section of the subject detail.
//
// It owns ONE thing — turning a listed apunte into the attachment the editor
// opens. The apuntes themselves arrive as props (the subject detail already
// fetched them on `materias:detail`), and the editing happens in the
// full-screen markdown viewer, which is the single surface allowed to write
// an apunte's text.
//
// There is deliberately no "add" path here, and it is not an oversight: an
// apunte belongs to a CLASS, and this section knows only which classes
// already have one. A "+ Agregar apunte" would have to ask which class it
// was — the one question every surface that can create one (Hoy's ClassRow,
// a Horario block) has already answered.
import { useQuery } from '@tanstack/react-query'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import type { ClassNoteRecord } from '../../../shared/ipc/materias'
import { adjuntosApi } from '../../adjuntos/adapters/adjuntosApi'
import { ApuntesSection } from '../components/ApuntesSection'

interface ApuntesContainerProps {
  subjectId: number
  notes: ClassNoteRecord[]
  /** Hands the apunte's attachment up to the screen that swaps itself for the editor. */
  onOpenApunte: (attachment: Attachment) => void
}

export function ApuntesContainer({ subjectId, notes, onOpenApunte }: ApuntesContainerProps): React.JSX.Element {
  // The SAME key AdjuntosContainer uses, so this shares its cache rather than
  // fetching a second copy. An apunte IS an attachment, so it rides on this
  // list like any other document — the ADJUNTOS section is what filters them
  // out for display, not the query.
  const { data: attachments } = useQuery({
    queryKey: ['adjuntos', subjectId],
    queryFn: () => adjuntosApi.list(subjectId)
  })

  return (
    <ApuntesSection
      notes={notes}
      onOpenApunte={(noteId) => {
        // A row whose attachment has not arrived yet simply does not open.
        // Synthesising one from the note record would hand the editor a
        // document with an invented size and index status, and the header
        // renders both.
        const attachment = attachments?.find((row) => row.id === noteId)
        if (attachment) {
          onOpenApunte(attachment)
        }
      }}
    />
  )
}
