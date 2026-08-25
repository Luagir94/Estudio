// Container (design §4): the APUNTES DE CLASE section of the subject detail,
// plus the class dialog its rows open.
//
// Rendered inside the subject detail, which already fetched the apuntes and
// the marks on `materias:detail` — so this takes them as props and owns only
// the open/closed state of the dialog. The writes themselves belong to
// `ClaseModalContainer`, which Hoy mounts too.
//
// There is deliberately no "add" path here: an apunte belongs to a class, and
// this section is an index of the classes that already have one.
import { useState } from 'react'
import type { AttendanceRecord, ClassNoteRecord } from '../../../shared/ipc/materias'
import { ApuntesSection } from '../components/ApuntesSection'
import { findAttendanceStatus, findClassNote, type ClassSlotLike } from '../domain/classOccurrence'
import { ClaseModalContainer } from './ClaseModalContainer'

interface ApuntesContainerProps {
  subjectId: number
  subjectName: string
  /** The subject's WEEKLY pattern — the dialog composes the occurrence out of it. */
  slots: ClassSlotLike[]
  notes: ClassNoteRecord[]
  /**
   * The subject's marks. This section does not display them, but the dialog it
   * opens edits the WHOLE class — asistencia included — so opening one from
   * here must not silently drop a mark the class already carries.
   */
  attendance: AttendanceRecord[]
}

export function ApuntesContainer({
  subjectId,
  subjectName,
  slots,
  notes,
  attendance
}: ApuntesContainerProps): React.JSX.Element {
  // The DATE is the open state, not a note id: the dialog is about a class,
  // and the class exists whether or not an apunte does.
  const [openDate, setOpenDate] = useState<string | null>(null)

  return (
    <>
      <ApuntesSection notes={notes} onOpenClase={setOpenDate} />

      {openDate !== null && (
        <ClaseModalContainer
          subjectId={subjectId}
          subjectName={subjectName}
          date={openDate}
          slots={slots}
          attendanceStatus={findAttendanceStatus(attendance, subjectId, openDate)}
          noteBody={findClassNote(notes, subjectId, openDate)?.body ?? ''}
          onClose={() => setOpenDate(null)}
        />
      )}
    </>
  )
}
