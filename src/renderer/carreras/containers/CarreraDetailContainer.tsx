// Container (design §4, node `cB6oE`): fetches one program with its periods
// (key ['carreras', id]) and owns the period/subject modal and
// confirm-dialog state.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { MateriasList } from '../../materias/components/MateriasList'
import { NuevaMateriaModal } from '../../materias/components/NuevaMateriaModal'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'
import { carrerasApi } from '../adapters/carrerasApi'
import { pickDefaultPeriodId } from '../domain/period'
import { DeletePeriodConfirmDialog } from '../components/DeletePeriodConfirmDialog'
import { DeleteProgramConfirmDialog } from '../components/DeleteProgramConfirmDialog'
import { EditarCarreraModal } from '../components/EditarCarreraModal'
import { NuevoPeriodoModal } from '../components/NuevoPeriodoModal'
import { PeriodTimeline } from '../components/PeriodTimeline'
import { PeriodsTable } from '../components/PeriodsTable'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost } from '../../shared/lib/interactive'
import { subjectColorForScheme } from '../../shared/lib/subjectColorScheme'
import { usePrefersLightScheme } from '../../shared/lib/usePrefersLightScheme'

interface CarreraDetailContainerProps {
  programId: number
  onBack: () => void
  /**
   * Opens a period's own screen. Omit and the period rows render as plain,
   * non-clickable markup — the same rule the subject rows follow.
   */
  onSelectPeriod?: (id: number) => void
  /**
   * Opens a subject's detail, which lives in the Materias screen. Owned by
   * App because the jump crosses two top-level domains. Omit it and the
   * subject rows render as plain, non-clickable markup.
   */
  onOpenSubject?: (id: number) => void
  /** Injected only by tests — see CarrerasContainer's `now`. */
  now?: Date
}

export function CarreraDetailContainer({
  programId,
  onBack,
  onSelectPeriod,
  onOpenSubject,
  now
}: CarreraDetailContainerProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  // Stored carrera colours come from the same subject catalogue; inline
  // styles cannot hear the light media query, so the mapping happens here.
  const scheme = usePrefersLightScheme() ? 'light' : 'dark'
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<PeriodRecord | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<PeriodRecord | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteProgramOpen, setIsDeleteProgramOpen] = useState(false)
  const today = now ?? new Date()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['carreras', programId],
    queryFn: () => carrerasApi.detail(programId)
  })

  function invalidatePeriods(): void {
    void queryClient.invalidateQueries({ queryKey: ['carreras', programId] })
    // The list card shows the period chips too, so it goes stale as well.
    void queryClient.invalidateQueries({ queryKey: ['carreras'] })
    // A subject's period decides its dates AND its estado ("sin cerrar"
    // only starts once the period ends), so both screens read from it.
    void queryClient.invalidateQueries({ queryKey: ['materias'] })
  }

  const createPeriodMutation = useMutation({
    mutationFn: carrerasApi.createPeriod,
    onSuccess: () => {
      invalidatePeriods()
      setIsModalOpen(false)
    }
  })

  const updatePeriodMutation = useMutation({
    mutationFn: carrerasApi.updatePeriod,
    onSuccess: () => {
      invalidatePeriods()
      setEditingPeriod(null)
    }
  })

  const deletePeriodMutation = useMutation({
    mutationFn: carrerasApi.deletePeriod,
    onSuccess: () => {
      invalidatePeriods()
      setDeletingPeriod(null)
    }
  })

  // Corrects the carrera in place. Its name and colour are printed on every
  // screen that mentions it, and its scheme decides how each subject's grade
  // is read, so BOTH cached trees go stale on success.
  const updateProgramMutation = useMutation({
    mutationFn: carrerasApi.update,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['carreras'] })
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      setIsEditOpen(false)
    }
  })

  // Deleting ends the screen: the program it was showing no longer exists, so
  // it hands control back to the list rather than re-rendering a detail for a
  // deleted row.
  const deleteProgramMutation = useMutation({
    mutationFn: () => carrerasApi.delete(programId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['carreras'] })
      // Its materias survive with a NULL period, so every screen that reads
      // a subject's carrera or período is now stale.
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      onBack()
    }
  })

  // Shares the ['materias'] key with the Materias screen — the subjects of
  // this carrera are a SUBSET of that same list, so filtering here costs one
  // pass over cached data instead of a second IPC channel that would have to
  // stay in sync with it.
  const { data: subjects } = useQuery({
    queryKey: ['materias'],
    queryFn: materiasApi.list
  })

  const createSubjectMutation = useMutation({
    mutationFn: materiasApi.create,
    onSuccess: () => {
      // This screen prints the subject count, and so do the list cards.
      invalidatePeriods()
      setIsSubjectModalOpen(false)
    }
  })

  // Same pre-selection rule as the Materias screen, but over THIS program's
  // periods only: getting here already answered "which carrera?", so the form
  // must not re-open that question with every other program's periods.
  const defaultPeriodId = useMemo(() => pickDefaultPeriodId(data?.periods ?? [], today), [data, today])

  // A subject reaches this carrera THROUGH its period, so one that lost its
  // period (`program: null`) belongs to no carrera and is not listed here —
  // the Materias screen is where it stays visible and fixable.
  const ownSubjects = useMemo(
    () => (subjects ?? []).filter((subject) => subject.program?.id === programId),
    [subjects, programId]
  )

  // Per-period subject counts for the table's MATERIAS column, one pass over
  // the SAME cached list the section below renders — the alternative was
  // widening the period record in the IPC contract, which every screen that
  // shows a period chip would then have to carry for one column.
  //
  // Counted over THIS carrera's subjects, not every subject: the column sits
  // in this carrera's table, so a period id is only ever looked up among the
  // subjects that reach this program.
  //
  // `undefined` until the list arrives, so the column can say "not yet"
  // rather than "none".
  const subjectCounts = useMemo(() => {
    if (subjects === undefined) {
      return undefined
    }
    const counts = new Map<number, number>()
    for (const subject of ownSubjects) {
      if (subject.periodId !== null) {
        counts.set(subject.periodId, (counts.get(subject.periodId) ?? 0) + 1)
      }
    }
    return counts
  }, [subjects, ownSubjects])

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          '-mx-2 flex w-fit items-center gap-2 rounded-md px-2 py-1 text-body-sm text-muted-foreground',
          interactiveGhost
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t('carreraDetailContainer.backToList')}
      </button>

      {isLoading && <p className="text-body-lg text-muted-foreground">{t('carreraDetailContainer.loading')}</p>}
      {isError && <p className="text-body-lg text-destructive">{t('carreraDetailContainer.loadError')}</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: subjectColorForScheme(data.color, scheme) }}
                  className="h-[34px] w-[3px] shrink-0 rounded-sm"
                />
                <h1 className="font-display text-display-lg font-bold text-foreground">{data.name}</h1>
              </div>
              <p className="text-body text-secondary-foreground">
                {[
                  data.institution,
                  t('counts.periods', { count: data.periods.length }),
                  t('counts.subjects', { count: data.subjectCount })
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {/* Editing and deleting are ONE entry point (design node
                  `QZAQD`): the delete lives in this modal's footer, the same
                  shape as the Materias screen. Four buttons in one header —
                  editar, eliminar, y dos "agregar" — is the alternative. */}
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(true)} className="gap-2">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('carreraDetailContainer.editProgram')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('carreraDetailContainer.addPeriod')}
              </Button>
              <Button type="button" onClick={() => setIsSubjectModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('carreraDetailContainer.addSubject')}
              </Button>
            </div>
          </div>

          <PeriodTimeline periods={data.periods} now={today} />
          <PeriodsTable
            periods={data.periods}
            now={today}
            subjectCounts={subjectCounts}
            onSelect={onSelectPeriod && ((period) => onSelectPeriod(period.id))}
            onEdit={setEditingPeriod}
            onDelete={setDeletingPeriod}
          />

          <div className="flex flex-col gap-3">
            <h2 className="text-label font-semibold text-muted-foreground">
              {t('carreraDetailContainer.ownSubjectsHeading')}
            </h2>
            <MateriasList
              subjects={ownSubjects}
              now={today}
              onSelect={onOpenSubject}
              emptyMessage={t('carreraDetailContainer.noSubjects')}
            />
          </div>

          {isModalOpen && (
            <NuevoPeriodoModal
              programId={data.id}
              programName={data.name}
              existingPeriods={data.periods}
              error={describeIpcError(createPeriodMutation.error)}
              onSubmit={(input) => createPeriodMutation.mutate(input)}
              onClose={() => setIsModalOpen(false)}
            />
          )}

          {editingPeriod && (
            <NuevoPeriodoModal
              programId={data.id}
              programName={data.name}
              period={editingPeriod}
              existingPeriods={data.periods}
              error={describeIpcError(updatePeriodMutation.error)}
              // `programId` comes back in the payload because the form
              // validates against the CREATE schema; the update command does
              // not take it (a period never changes carrera), so it is
              // dropped here rather than smuggled across the bridge.
              onSubmit={({ programId: _programId, ...fields }) =>
                updatePeriodMutation.mutate({ id: editingPeriod.id, ...fields })
              }
              onClose={() => setEditingPeriod(null)}
            />
          )}

          {deletingPeriod && (
            <DeletePeriodConfirmDialog
              periodName={deletingPeriod.name}
              subjectCount={ownSubjects.filter((subject) => subject.periodId === deletingPeriod.id).length}
              error={describeIpcError(deletePeriodMutation.error)}
              onConfirm={() => deletePeriodMutation.mutate(deletingPeriod.id)}
              onCancel={() => setDeletingPeriod(null)}
            />
          )}

          {isEditOpen && (
            <EditarCarreraModal
              program={data}
              error={describeIpcError(updateProgramMutation.error)}
              onSubmit={(input) => updateProgramMutation.mutate(input)}
              // The confirmation REPLACES the form rather than stacking on it,
              // so the destructive question is never asked underneath an
              // editable copy of the same carrera (same as EditarMateriaModal).
              onDelete={() => {
                setIsEditOpen(false)
                setIsDeleteProgramOpen(true)
              }}
              onClose={() => setIsEditOpen(false)}
            />
          )}

          {isDeleteProgramOpen && (
            <DeleteProgramConfirmDialog
              programName={data.name}
              periodCount={data.periods.length}
              // From the detail payload, not the ['materias'] cache: this
              // count decides what the dialog PROMISES, so it has to come
              // from the same source the delete itself counts over.
              subjectCount={data.subjectCount}
              error={describeIpcError(deleteProgramMutation.error)}
              onConfirm={() => deleteProgramMutation.mutate()}
              onCancel={() => setIsDeleteProgramOpen(false)}
            />
          )}

          {isSubjectModalOpen && (
            <NuevaMateriaModal
              programs={[data]}
              defaultPeriodId={defaultPeriodId}
              onSubmit={(input) => createSubjectMutation.mutate(input)}
              onClose={() => setIsSubjectModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
