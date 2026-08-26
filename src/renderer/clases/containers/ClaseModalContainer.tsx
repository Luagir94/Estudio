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
  onClose: () => void
}

export function ClaseModalContainer({
  subjectId,
  subjectName,
  date,
  slots,
  attendanceStatus,
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

  // ONE command, because the dialog now says exactly one thing: whether you
  // were in that class. The apunte is a document with its own editor and its
  // own save — nothing here can write one, which is what keeps a single
  // surface responsible for a given apunte's text.
  //
  // Still an UPSERT/DELETE pair rather than a create/update one: an unmarked
  // class is the ABSENCE of a row, never a fourth status.
  const saveMutation = useMutation({
    mutationFn: async ({ status }: ClaseFormValues) => {
      await (status === null
        ? clasesApi.clearAttendance({ subjectId, date })
        : clasesApi.setAttendance({ subjectId, date, status }))
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
      error={describeIpcError(saveMutation.error)}
      pending={saveMutation.isPending}
      onSubmit={(values) => saveMutation.mutate(values)}
      onClose={onClose}
    />
  )
}
