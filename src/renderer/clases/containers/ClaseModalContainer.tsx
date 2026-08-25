// Container (design §4): owns every write a class can take, for ONE
// `(subjectId, date)` pair.
//
// It exists as its own container because the same dialog is opened from two
// screens — a ClassRow in Hoy and an APUNTES DE CLASE row in the subject
// detail — and neither of them should own a copy of the write rules. Mount it
// with the class you want opened; it closes itself on success.
//
// This is also the single place where the pair is turned back into a concrete
// class: `resolveClassOccurrence` crosses the date with the slots currently in
// effect. Nothing dated is stored, so this crossing is the only thing that can
// answer "at what time, in which aula" — and if the horario no longer covers
// the date, the honest answer is "unknown", not a guess.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AttendanceStatus } from '../../../shared/ipc/materias'
import { clasesApi } from '../adapters/clasesApi'
import { ClaseModal, type ClaseFormValues } from '../components/ClaseModal'
import { resolveClassOccurrence, type ClassSlotLike } from '../domain/classOccurrence'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'

interface ClaseModalContainerProps {
  subjectId: number
  subjectName: string
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string
  /** The subject's WEEKLY pattern. The occurrence is composed from it here, never stored. */
  slots: ClassSlotLike[]
  attendanceStatus: AttendanceStatus | null
  /** The stored apunte, or '' when the class has none. */
  noteBody: string
  onClose: () => void
}

export function ClaseModalContainer({
  subjectId,
  subjectName,
  date,
  slots,
  attendanceStatus,
  noteBody,
  onClose
}: ClaseModalContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()

  // TWO keys, and both are needed: the subject detail carries the ASISTENCIA
  // card and the APUNTES list, and the Hoy dashboard carries the per-row mark
  // controls. Nothing else is derived from a class — not the subject's estado,
  // not the Materias list, not the carreras average — so nothing else is
  // invalidated. The subject's `regularity` in particular is the cátedra's
  // verdict and no mark moves it.
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
    void queryClient.invalidateQueries({ queryKey: ['hoy', 'dashboard'] })
  }

  // ONE mutation for both halves, because "Guardar clase" is one action: a
  // single pending state, a single failure to report, one close.
  //
  // The mark is written first. If the apunte write then fails, the mark has
  // landed and the dialog stays open reporting the failure — which is the
  // honest outcome, and a harmless one: both commands are UPSERTS keyed by
  // `(subjectId, date)`, so pressing Guardar again re-applies the same mark
  // rather than recording a second one.
  const saveMutation = useMutation({
    mutationFn: async ({ status, body }: ClaseFormValues) => {
      await (status === null
        ? clasesApi.clearAttendance({ subjectId, date })
        : clasesApi.setAttendance({ subjectId, date, status }))

      // An emptied apunte is a DELETED apunte — there is no such stored thing
      // as a blank one, which is what keeps "has an apunte" a question the
      // row's presence answers.
      const trimmed = body.trim()
      await (trimmed === ''
        ? clasesApi.deleteNote({ subjectId, date })
        : clasesApi.saveNote({ subjectId, date, body: trimmed }))
    },
    onSuccess: () => {
      invalidate()
      onClose()
    }
  })

  return (
    <ClaseModal
      subjectName={subjectName}
      date={date}
      occurrence={resolveClassOccurrence(slots, date)}
      attendanceStatus={attendanceStatus}
      noteBody={noteBody}
      error={describeIpcError(saveMutation.error)}
      pending={saveMutation.isPending}
      onSubmit={(values) => saveMutation.mutate(values)}
      onClose={onClose}
    />
  )
}
