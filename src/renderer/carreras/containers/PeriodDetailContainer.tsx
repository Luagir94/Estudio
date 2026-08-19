// Container (design node `TfFjk`): one period, its metadata and its materias.
//
// It reads the SAME two cached queries the carrera detail already holds —
// ['carreras', programId] for the period and ['materias'] for the subjects —
// rather than adding a `carreras:periodDetail` channel. A period is a handful
// of fields on a payload this screen's parent has already fetched; a second
// channel would be a second copy of that data, free to disagree with the
// first.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { NuevaMateriaModal } from '../../materias/components/NuevaMateriaModal'
import { carrerasApi } from '../adapters/carrerasApi'
import { NuevoPeriodoModal } from '../components/NuevoPeriodoModal'
import { PeriodDetail } from '../components/PeriodDetail'

interface PeriodDetailContainerProps {
  programId: number
  periodId: number
  /** Back to the carrera this period belongs to. */
  onBack: () => void
  /** Opens a subject's detail, which lives in the Materias screen. */
  onOpenSubject?: (id: number) => void
  /** Injected only by tests. */
  now?: Date
}

export function PeriodDetailContainer({
  programId,
  periodId,
  onBack,
  onOpenSubject,
  now
}: PeriodDetailContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false)
  const today = now ?? new Date()

  const {
    data: program,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['carreras', programId],
    queryFn: () => carrerasApi.detail(programId)
  })

  const { data: subjects } = useQuery({ queryKey: ['materias'], queryFn: materiasApi.list })

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['carreras', programId] })
    void queryClient.invalidateQueries({ queryKey: ['carreras'] })
    // A subject's period decides its dates AND its estado, so the materias
    // screens go stale with it.
    void queryClient.invalidateQueries({ queryKey: ['materias'] })
  }

  const updatePeriodMutation = useMutation({
    mutationFn: carrerasApi.updatePeriod,
    onSuccess: () => {
      invalidate()
      setIsEditOpen(false)
    }
  })

  const createSubjectMutation = useMutation({
    mutationFn: materiasApi.create,
    onSuccess: () => {
      invalidate()
      setIsSubjectModalOpen(false)
    }
  })

  const period = program?.periods.find((candidate) => candidate.id === periodId)

  const ownSubjects = useMemo(
    () => (subjects ?? []).filter((subject) => subject.periodId === periodId),
    [subjects, periodId]
  )

  if (isLoading) {
    return <p className="text-body-lg text-muted-foreground">Cargando período…</p>
  }
  if (isError) {
    return <p className="text-body-lg text-destructive">No se pudo cargar el período.</p>
  }
  // The carrera loaded but this period is not in it — it was deleted from
  // another screen while this one was open. Saying so beats rendering a
  // detail for something that no longer exists.
  if (program === undefined || period === undefined) {
    return <p className="text-body-lg text-muted-foreground">Este período ya no existe.</p>
  }

  return (
    <>
      <PeriodDetail
        period={period}
        programName={program.name}
        programColor={program.color}
        subjects={ownSubjects}
        now={today}
        onBack={onBack}
        onEdit={() => setIsEditOpen(true)}
        onAddSubject={() => setIsSubjectModalOpen(true)}
        onOpenSubject={onOpenSubject}
      />

      {isEditOpen && (
        <NuevoPeriodoModal
          programId={program.id}
          programName={program.name}
          period={period}
          existingPeriods={program.periods}
          error={updatePeriodMutation.error?.message}
          // The form validates against the CREATE schema, so `programId`
          // comes back in the payload; the update command does not take it
          // (a period never changes carrera), so it is dropped here.
          onSubmit={({ programId: _programId, ...fields }) => updatePeriodMutation.mutate({ id: period.id, ...fields })}
          onClose={() => setIsEditOpen(false)}
        />
      )}

      {isSubjectModalOpen && (
        <NuevaMateriaModal
          programs={[program]}
          // Getting here already answered "which período?", so the picker
          // opens on THIS one rather than re-asking.
          defaultPeriodId={periodId}
          onSubmit={(input) => createSubjectMutation.mutate(input)}
          onClose={() => setIsSubjectModalOpen(false)}
        />
      )}
    </>
  )
}
