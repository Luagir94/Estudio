// Container (design §4, node `cB6oE`): fetches one program with its periods
// (key ['carreras', id]) and owns the period/subject modal and
// confirm-dialog state.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { withoutImpliedEdges } from '../../../shared/domain/prerequisiteGraph'
import type { PeriodRecord } from '../../../shared/ipc/carreras'
import { FechasCardContainer } from '../../fechas/containers/FechasCardContainer'
import { materiasApi } from '../../materias/adapters/materiasApi'
import { MateriasList } from '../../materias/components/MateriasList'
import { NuevaMateriaModal } from '../../materias/components/NuevaMateriaModal'
import { useBusySlots } from '../../materias/containers/useBusySlots'
import { describeIpcError } from '../../shared/lib/ipcErrorCopy'
import { useOptionalControlled } from '../../shared/lib/useOptionalControlled'
import { isPassed } from '../../materias/domain/subjectStatus'
import { carrerasApi } from '../adapters/carrerasApi'
import { DEFAULT_CARRERA_TAB, type CarreraTab } from '../domain/carreraTab'
import { derivePeriodYear, formatPeriodRange, listCurrentPeriods, pickDefaultPeriodId } from '../domain/period'
import {
  approvedProgressPercent,
  calculateProgramAverage,
  formatAverage,
  resolveEffectiveGrade
} from '../domain/program'
import { DeletePeriodConfirmDialog } from '../components/DeletePeriodConfirmDialog'
import { DeleteProgramConfirmDialog } from '../components/DeleteProgramConfirmDialog'
import { EditarCarreraModal } from '../components/EditarCarreraModal'
import { NuevoPeriodoModal } from '../components/NuevoPeriodoModal'
import { PeriodTimeline } from '../components/PeriodTimeline'
import { PeriodsTable } from '../components/PeriodsTable'
import { PlanDraftRail } from '../components/PlanDraftRail'
import { PlanSubjectInspector } from '../components/PlanSubjectInspector'
import { CorrelativasFieldContainer } from '../../planificador/containers/CorrelativasFieldContainer'
import { PlanMapCanvas, type PlanMapBox } from '../components/PlanMapCanvas'
import { layOutPlanMap } from '../domain/planMap'
import { planificadorApi } from '../../planificador/adapters/planificadorApi'
import { listCandidates } from '../../planificador/domain/requirements'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveGhost } from '../../shared/lib/interactive'
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
  /**
   * The open tab, when the ADDRESS owns it (see `router.tsx`'s
   * `carreraDetailRoute`). Passed with `onTabChange` or not at all — omitted,
   * the container keeps the tab in its own state, which is what every test
   * that renders it without a router relies on.
   *
   * BOTH halves, never one: `useOptionalControlled` reads either alone as a
   * wiring mistake and keeps the state here. A caller that hands over
   * `onTabChange` therefore has to resolve an absent `?tab=` to
   * `DEFAULT_CARRERA_TAB` itself rather than passing `undefined` through.
   */
  activeTab?: CarreraTab
  onTabChange?: (tab: CarreraTab) => void
}

export function CarreraDetailContainer({
  programId,
  onBack,
  onSelectPeriod,
  onOpenSubject,
  now,
  activeTab: controlledTab,
  onTabChange
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

  // Creating a subject: nothing to exclude, every attended class hour
  // counts as taken. Feeds the slot editor's overlap warning.
  const busySlots = useBusySlots(null, today)

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

  // Everything the right rail shows is derived from data this screen already
  // fetches — the "PERÍODO EN CURSO" card reads the active periods (plural on
  // purpose, see domain/period.ts) and the "AVANCE ACADÉMICO" card reads the
  // same detail payload the header subtitle prints from.
  const currentPeriods = useMemo(() => listCurrentPeriods(data?.periods ?? [], today), [data, today])
  const currentPeriod = currentPeriods[0]
  const companionPeriods = currentPeriods.slice(1)

  // The avance card's numbers (design node `ghb9r`): the promedio over
  // `gradedSubjects` and the approved count against `subjectCount`, both
  // resolved through the SAME domain rules the rest of the app answers with
  // (calculateProgramAverage, isPassed) — never re-derived here.
  const academicProgress = useMemo(() => {
    const gradedSubjects = data?.gradedSubjects ?? []
    const approved = gradedSubjects.filter(isPassed).length
    const total = data?.subjectCount ?? 0
    return {
      average: calculateProgramAverage(
        gradedSubjects.map((subject) => ({ grade: resolveEffectiveGrade(subject), passed: isPassed(subject) }))
      ),
      approved,
      total,
      percent: approvedProgressPercent(approved, total)
    }
  }, [data])

  // A subject belongs to this carrera by its OWN `programId` — a fact about the
  // plan de estudios, true whether or not it has ever been cursada.
  //
  // The period-derived `program` stays as a fallback, and must: `programId` is
  // nullable, so every row written before that column existed still reaches its
  // carrera the old way. Reading the period ALONE was the bug this replaced —
  // `periodId` is nullable too, so a materia nobody has cursado yet belonged to
  // no carrera at all and silently vanished from this screen.
  const ownSubjects = useMemo(
    () => (subjects ?? []).filter((subject) => (subject.programId ?? subject.program?.id) === programId),
    [subjects, programId]
  )

  // Which half of the carrera you are looking at. The plan de estudios and the
  // períodos are two axes over the same materias — the plan belongs to the
  // carrera and never changes, the períodos are your own timeline — so they are
  // two tabs rather than one crowded page.
  //
  // Owned by the ADDRESS when the router mounts this screen (`?tab=`), and by
  // the container otherwise — same arrangement `SubjectDetailContainer` has
  // with its own tab. Períodos is the landing tab, and the fallback for a
  // `?tab=` the address carries but this screen does not recognise.
  const [activeTab, setActiveTab] = useOptionalControlled<CarreraTab>(controlledTab, onTabChange, DEFAULT_CARRERA_TAB)

  // Which materia the rail is inspecting. On the map a click SELECTS rather
  // than navigates: you are planning, not browsing, and leaving the canvas to
  // add one correlativa loses the whole picture you came here to read.
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)

  const { data: draftEntries } = useQuery({ queryKey: ['planificador'], queryFn: planificadorApi.list })

  function invalidateDraft(): void {
    void queryClient.invalidateQueries({ queryKey: ['planificador'] })
  }

  const addToDraftMutation = useMutation({ mutationFn: planificadorApi.addEntry, onSuccess: invalidateDraft })
  const removeFromDraftMutation = useMutation({ mutationFn: planificadorApi.removeEntry, onSuccess: invalidateDraft })

  // Every box's state resolved through the SAME rules the rest of the app
  // answers with, never re-derived here. `listCandidates` excludes exactly the
  // approved and the already-drafted, which is what makes the `aprobada`
  // fallback below a deduction rather than a guess.
  // Resolved from `ownSubjects`, never from a second fetch: a selection that
  // outlived its materia (deleted, or moved to another carrera) simply stops
  // resolving and the rail falls back to the borrador.
  const selectedSubject = ownSubjects.find((subject) => subject.id === selectedSubjectId)

  // The correlativas editor needs the DETAIL payload, not the list one: the
  // list carries `{requiresSubjectId, requiredLevel}` while the picker renders
  // each requirement's name and estado. Same key the Materias screen uses, so
  // the two share one cache instead of racing two.
  const { data: selectedDetail } = useQuery({
    queryKey: ['materias', 'detail', selectedSubjectId],
    queryFn: () => materiasApi.detail(selectedSubjectId as number),
    enabled: selectedSubject !== undefined
  })

  // One line for all three plan writes. Whichever failed most recently is the
  // one worth naming; they cannot fail usefully at the same time.
  const planError = describeIpcError(addToDraftMutation.error) ?? describeIpcError(removeFromDraftMutation.error)

  const planMap = useMemo(() => {
    const drafted = new Set((draftEntries ?? []).map((entry) => entry.subjectId))
    const candidates = new Map(
      listCandidates(ownSubjects, drafted).map((candidate) => [candidate.subject.id, candidate])
    )

    const boxes: PlanMapBox[] = ownSubjects.map((subject) => {
      const base = { id: subject.id, name: subject.name }
      if (drafted.has(subject.id)) {
        return { ...base, meta: `${subject.code} · ${t('planMap.enBorrador')}`, state: 'enBorrador' }
      }
      const candidate = candidates.get(subject.id)
      if (candidate === undefined) {
        return { ...base, meta: `${subject.code} · ${t('planMap.aprobada')}`, state: 'aprobada' }
      }
      const unmet = candidate.unmet[0]
      if (unmet === undefined) {
        return { ...base, meta: subject.code, state: 'habilitada' }
      }
      // The reason comes from the planificador's catalog rather than a second
      // copy here: it is the same sentence the borrador already prints.
      //
      // It rides in `reason`, NOT in `meta`: a blocked materia shows its code
      // like every other box and the sentence becomes the box's tooltip. The
      // two lines were fighting over a 138×58 box, and the name was losing.
      return {
        ...base,
        meta: subject.code,
        reason:
          unmet.subjectName === null
            ? t('planificador:candidates.missingUnknownSubject')
            : t('planificador:candidates.missing', {
                subject: unmet.subjectName,
                level: t(`planificador:levels.${unmet.requiredLevel}`)
              }),
        state: 'bloqueada'
      }
    })

    // Reduced, never raw. The write path accepts a correlativa the chain
    // already implies — it is noise, not a contradiction — so a stored plan can
    // hold one. Drawing it would put a line on the map carrying nothing the
    // other two do not already say, and an implied edge usually SKIPS a column,
    // so it travels a lane around the boxes in between to get there: a loop
    // curling under an unrelated materia, for no information at all.
    //
    // Reduced before `layOutPlanMap`, not after, so the ordering sweep is not
    // pulled around by an edge nobody will see either. The stored correlativas
    // are untouched: the rail still lists the redundant one, and removing it is
    // the student's call.
    const edges = withoutImpliedEdges(
      ownSubjects.flatMap((subject) =>
        subject.prerequisites.map((prerequisite) => ({
          subjectId: subject.id,
          requiresSubjectId: prerequisite.requiresSubjectId
        }))
      )
    )
    // `SubjectWithStatus` satisfies `DraftSubject` structurally (id/name/color/
    // slots), so this narrows rather than adapts — no second shape to keep in
    // step with the readings the rail rides on.
    const drafts = ownSubjects.filter((subject) => drafted.has(subject.id))
    return { layout: layOutPlanMap(ownSubjects, edges), boxes, edges, drafts }
  }, [ownSubjects, draftEntries, t])

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

          {/* Two axes over the same materias, so two tabs (design node
              `JZB54`). Pills rather than an underline: this app already spells
              a segmented choice that way in the Materias status filter. */}
          <div role="tablist" aria-label={t('planMap.tabsLabel')} className="flex items-center gap-2">
            {(
              [
                ['periods', 'planMap.tabPeriods'],
                ['plan', 'planMap.tabPlan']
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-body-sm font-semibold',
                  interactive,
                  activeTab === tab
                    ? 'border-primary bg-brand-soft text-primary-ink'
                    : 'border-border bg-muted text-secondary-foreground'
                )}
              >
                {t(label)}
              </button>
            ))}
          </div>

          {/* Every write the plan tab makes used to fail in SILENCE: three
              mutations with an `onSuccess` and no `onError`, so a rejected IPC
              call left the screen exactly as it was and the button looked
              inert. A failed write has to say so. */}
          {activeTab === 'plan' && planError !== undefined && (
            <p role="alert" data-testid="plan-map-error" className="text-body-sm font-semibold text-destructive">
              {planError}
            </p>
          )}

          {activeTab === 'plan' && (
            <div className="flex flex-col gap-6 min-[820px]:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <PlanMapCanvas
                  layout={planMap.layout}
                  boxes={planMap.boxes}
                  edges={planMap.edges}
                  // Which período the borrador is being built for is the same
                  // question the "nueva materia" form already answers, so it gets
                  // the same answer rather than a second rule that could disagree.
                  //
                  // With no plannable período there is nothing to add TO, and the
                  // `+` disappears from every box instead of failing on click.
                  onAdd={
                    defaultPeriodId === null
                      ? undefined
                      : (subjectId) => addToDraftMutation.mutate({ periodId: defaultPeriodId, subjectId })
                  }
                  onRemove={
                    defaultPeriodId === null
                      ? undefined
                      : (subjectId) => removeFromDraftMutation.mutate({ periodId: defaultPeriodId, subjectId })
                  }
                  selectedId={selectedSubjectId}
                  onSelect={setSelectedSubjectId}
                />
              </div>
              {/* One rail, two jobs. The borrador is what the map adds up to;
                  the inspector is one materia within it. They cannot both hold
                  the rail, and while you are editing correlativas the borrador
                  is not what you are looking at. */}
              {selectedSubject === undefined ? (
                <PlanDraftRail draft={planMap.drafts} />
              ) : (
                <PlanSubjectInspector
                  subjectName={selectedSubject.name}
                  correlativasSlot={
                    <CorrelativasFieldContainer
                      subjectId={selectedSubject.id}
                      prerequisites={selectedDetail?.prerequisites ?? []}
                      variant="compact"
                    />
                  }
                  onOpenSubject={onOpenSubject && (() => onOpenSubject(selectedSubject.id))}
                />
              )}
            </div>
          )}

          {activeTab === 'periods' && (
            <PeriodTimeline
              periods={data.periods}
              now={today}
              markers={data.upcomingTimelineMarkers ?? []}
              onOpenSubject={onOpenSubject}
            />
          )}

          {/* Two-column body, same layout language as SubjectDetail: the rail
              is a SIDE panel only while there is a side to put it on — below
              820px it becomes the bottom of the page, stacked, full width.
              Rendered, not hidden, when the other tab is up: a `hidden` class
              would leave every row of it in the accessibility tree. */}
          {activeTab === 'periods' && (
            <div className="flex flex-col gap-6 min-[820px]:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <PeriodsTable
                  periods={data.periods}
                  now={today}
                  subjectCounts={subjectCounts}
                  onSelect={onSelectPeriod && ((period) => onSelectPeriod(period.id))}
                  onEdit={setEditingPeriod}
                  onDelete={setDeletingPeriod}
                />

                <div className="flex flex-col gap-2">
                  {/* Count appended outside the translation, same pattern as
                    the PERÍODOS and ADJUNTOS headings. */}
                  <h2 className="text-label font-semibold text-muted-foreground">
                    {t('carreraDetailContainer.ownSubjectsHeading')}
                    {ownSubjects.length > 0 && ` · ${ownSubjects.length}`}
                  </h2>
                  <MateriasList
                    subjects={ownSubjects}
                    now={today}
                    onSelect={onOpenSubject}
                    emptyMessage={t('carreraDetailContainer.noSubjects')}
                    compact
                  />
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 min-[820px]:w-[336px] min-[820px]:shrink-0">
                <div className="flex flex-col gap-2 rounded-xl border border-primary bg-(--color-brand-soft) p-4">
                  <span className="text-overline font-semibold text-primary-ink">
                    {t('carreraDetailContainer.currentPeriodHeading')}
                  </span>
                  {currentPeriod ? (
                    <>
                      <span className="font-display text-heading font-bold text-foreground">
                        {currentPeriod.name} {derivePeriodYear(currentPeriod.startsOn)}
                      </span>
                      <span className="text-body-sm text-secondary-foreground">
                        {formatPeriodRange(currentPeriod.startsOn, currentPeriod.endsOn)}
                        {companionPeriods.length > 0 &&
                          ` · ${t('carreraDetailContainer.alongside', {
                            names: companionPeriods.map((period) => period.name).join(', ')
                          })}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-body-lg font-medium text-secondary-foreground">
                      {t('carreraDetailContainer.noCurrentPeriod')}
                    </span>
                  )}
                </div>

                {/* "AVANCE ACADÉMICO" (design node `ghb9r`): the promedio con
                  aplazos as the hero number — the honest average, see
                  domain/program.ts — over an approved-share progress bar,
                  keeping the period rows of the old numbers card. The plain
                  Materias row is gone: the count already reads in the header
                  subtitle and in the pill's own total. */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                  <span className="text-overline font-semibold text-muted-foreground">
                    {t('carreraDetailContainer.academicProgressHeading')}
                  </span>
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-0.5">
                      {/* The design's hero-number size. It used to be written
                        here as `text-[28px] tracking-[-0.5px]` with a note
                        saying it was deliberately off the scale; it is now the
                        `display-md` step, so the exception is declared once in
                        `globals.css` instead of living in this one file. */}
                      <span className="font-display text-display-md font-bold text-foreground">
                        {academicProgress.average.withFailed !== null
                          ? formatAverage(academicProgress.average.withFailed)
                          : '—'}
                      </span>
                      <span className="text-body-sm text-secondary-foreground">
                        {t('carreraDetailContainer.averageLabel')}
                      </span>
                    </div>
                    {/* 11px is off the scale too — the design's pill step. */}
                    <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok">
                      {t('carreraDetailContainer.approvedOfTotal', {
                        count: academicProgress.approved,
                        total: academicProgress.total
                      })}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${academicProgress.percent}%` }} />
                  </div>
                  <span aria-hidden="true" className="h-px w-full bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-secondary-foreground">
                      {t('carreraDetailContainer.statPeriods')}
                    </span>
                    <span className="text-body-sm font-semibold text-foreground">{data.periods.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-secondary-foreground">
                      {t('carreraDetailContainer.statActive')}
                    </span>
                    <span className="text-body-sm font-semibold text-foreground">{currentPeriods.length}</span>
                  </div>
                </div>

                {/* "FECHAS ADMINISTRATIVAS" (approved design): inscripciones,
                  vencimientos y trámites belong to the CARRERA, not to any one
                  materia, so this is the screen that owns them. Composed as a
                  container rather than folded into this one — it brings its own
                  query, three mutations and two dialogs, the same reason
                  SubjectDetailContainer composes AdjuntosContainer. */}
                <FechasCardContainer programId={data.id} programName={data.name} now={today} />
              </div>
            </div>
          )}

          {isModalOpen && (
            <NuevoPeriodoModal
              programId={data.id}
              programName={data.name}
              existingPeriods={data.periods}
              error={describeIpcError(createPeriodMutation.error)}
              pending={createPeriodMutation.isPending}
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
              pending={updatePeriodMutation.isPending}
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
              pending={updateProgramMutation.isPending}
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
              busySlots={busySlots}
              programs={[data]}
              defaultPeriodId={defaultPeriodId}
              pending={createSubjectMutation.isPending}
              onSubmit={(input) => createSubjectMutation.mutate(input)}
              onClose={() => setIsSubjectModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
