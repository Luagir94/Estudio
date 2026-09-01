// Container (design §4): owns data fetching (TanStack Query, key
// ['materias','detail',id]) and ephemeral edit/delete-dialog open state;
// computes the pure subject-detail read model (próxima clase/progreso/
// horas-semana) at RENDER time from the fetched raw records — "now" is a
// rendering-time concern, not baked into the cached query payload.
//
// Design (nodes `TYFvB` / `m0BYl` / `Z12LY`, verified via the Pencil MCP
// tools) puts BOTH "Editar materia" and "Eliminar materia" in the header's
// `⋯` menu. Editing used to be a full outline button competing with "Cerrar
// materia", and deleting was reachable only from inside the edit modal's
// footer — a destructive action behind a form you did not come to fill in.
//
// The left column is TABBED (Entregas / Parciales / Apuntes / Notas), so one
// section — and therefore one section action — shows at a time. APUNTES is a
// single tab holding class apuntes AND uploaded files: they are one record
// type differing only by `classDate`, and they were being drawn as two
// sections over the same query.
//
// This container is ALSO the ONLY place a subject's OUTCOME can be recorded.
// "Cerrar materia" in the detail header opens `CerrarMateriaModal` and
// submits `materias:setOutcome`. That used to live on the Materias list,
// gated behind the "sin cerrar" banner, which only appeared once a período
// had ENDED — so a promoción could not be recorded mid-cursada, and since
// `finalPendiente` is what reveals the FINALES section below, the finales
// flow was unreachable with it.
//
// Amendment 8: this container is now ALSO the ONLY place a deadline can be
// created. The ENTREGAS section header's "Agregar entrega" button (design
// node `l4Wr1F`) opens the entregas domain's `NuevaEntregaModal`, reused
// as-is (same cross-domain reuse precedent `EntregasContainer` already
// established the other way, importing `materiasApi`), fixed to THIS
// subject's id — never a user-chosen field. On success this invalidates
// both `['materias','detail',subjectId]` (so the ENTREGAS list on THIS
// screen refreshes) and `['entregas']` (so the cross-subject Entregas view
// is not stale the next time it mounts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useOptionalControlled } from '../../shared/lib/useOptionalControlled'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { adjuntosApi } from '../../adjuntos/adapters/adjuntosApi'
import { AdjuntosContainer } from '../../adjuntos/containers/AdjuntosContainer'
import { AttachmentViewerContainer } from '../../adjuntos/containers/AttachmentViewerContainer'
import { entregasApi } from '../../entregas/adapters/entregasApi'
import { NuevaEntregaModal } from '../../entregas/components/NuevaEntregaModal'
import { computeProgreso, computeWeeklyMinutes, getNextClassOccurrence } from '../domain/subjectDetail'
import type { SubjectOrigin } from '../domain/subjectOrigin'
import { appApi } from '../../shared/adapters/appApi'
import { materiasApi } from '../adapters/materiasApi'
import { CerrarMateriaModal } from '../components/CerrarMateriaModal'
import { DeleteSubjectConfirmDialog } from '../components/DeleteSubjectConfirmDialog'
import { carrerasApi } from '../../carreras/adapters/carrerasApi'
import { EditarMateriaModal } from '../components/EditarMateriaModal'
import { useBusySlots } from './useBusySlots'
import { SubjectDetail } from '../components/SubjectDetail'
import { DEFAULT_SUBJECT_DETAIL_TAB, type SubjectDetailTabId } from '../components/SubjectDetailTabs'
import { FinalesContainer } from '../../finales/containers/FinalesContainer'
import { ParcialesContainer } from '../../parciales/containers/ParcialesContainer'
import { CorrelativasFieldContainer } from '../../planificador/containers/CorrelativasFieldContainer'

interface SubjectDetailContainerProps {
  subjectId: number
  onBack: () => void
  /** Injection point for deterministic "próxima clase" tests. Defaults to the real clock. */
  now?: Date
  /**
   * The open tab, when the ADDRESS owns it (see `router.tsx`'s
   * `subjectDetailRoute`). Passed with `onTabChange` or not at all — omitted,
   * the container keeps the tab in its own state, which is what every test
   * that renders it without a router relies on.
   *
   * BOTH halves, never one: `useOptionalControlled` reads either alone as a
   * wiring mistake and keeps the state here. A caller that hands over
   * `onTabChange` therefore has to resolve an absent `?tab=` to
   * `DEFAULT_SUBJECT_DETAIL_TAB` itself rather than passing `undefined`
   * through.
   */
  activeTab?: SubjectDetailTabId
  onTabChange?: (tab: SubjectDetailTabId) => void
  /**
   * Which screen this subject was opened from (see `router.tsx`'s `?from=`).
   * Forwarded to `SubjectDetail` for its Back label ONLY — this container
   * never reads it for navigation, `onBack` already resolves the real target.
   */
  origin?: SubjectOrigin
}

export function SubjectDetailContainer({
  subjectId,
  onBack,
  now = new Date(),
  activeTab: controlledTab,
  onTabChange,
  origin
}: SubjectDetailContainerProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const queryClient = useQueryClient()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isAddEntregaOpen, setIsAddEntregaOpen] = useState(false)
  const [isCloseOpen, setIsCloseOpen] = useState(false)
  // Which section the left column shows. Owned by the ADDRESS when the router
  // mounts this screen (`?tab=`), and by the container otherwise — same
  // arrangement `MateriasListContainer` has with its status filter. Before
  // that, leaving a subject and coming back always dropped you on Entregas,
  // however deep in Parciales you had been.
  //
  // Entregas is the landing tab, and the fallback for a `?tab=` the address
  // carries but this screen does not recognise.
  const [activeTab, setActiveTab] = useOptionalControlled<SubjectDetailTabId>(
    controlledTab,
    onTabChange,
    DEFAULT_SUBJECT_DETAIL_TAB
  )
  // markdown-attachment-viewer: while set, the full-screen viewer renders
  // INSTEAD of the detail screen — the exact MateriasContainer
  // selectedSubjectId pattern, one level further down.
  const [viewedAttachment, setViewedAttachment] = useState<Attachment | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['materias', 'detail', subjectId],
    queryFn: () => materiasApi.detail(subjectId)
  })

  // Only for the APUNTES tab's count — the WHOLE list, class apuntes included,
  // because they are no longer a separate section. Same key `AdjuntosContainer`
  // uses, so TanStack dedupes it into that one request instead of a second.
  const { data: attachments } = useQuery({
    queryKey: ['adjuntos', subjectId],
    queryFn: () => adjuntosApi.list(subjectId)
  })

  // Feeds the período picker inside the edit modal. Shares the ['carreras']
  // cache with the Carreras screen.
  const { data: programs } = useQuery({
    queryKey: ['carreras'],
    queryFn: carrerasApi.list
  })

  const updateMutation = useMutation({
    mutationFn: materiasApi.updateSchedule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      setIsEditOpen(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: () => materiasApi.delete(subjectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      onBack()
    }
  })

  // Invalidates FOUR keys on purpose: this detail (the FINALES section
  // appears or disappears with the outcome), the Materias list and its
  // status filters, and the Carreras cards, whose subject counts and program
  // average are computed from exactly this field.
  const outcomeMutation = useMutation({
    mutationFn: materiasApi.setOutcome,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
      void queryClient.invalidateQueries({ queryKey: ['materias'] })
      void queryClient.invalidateQueries({ queryKey: ['carreras'] })
      setIsCloseOpen(false)
    }
  })

  const createEntregaMutation = useMutation({
    mutationFn: entregasApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materias', 'detail', subjectId] })
      void queryClient.invalidateQueries({ queryKey: ['entregas'] })
      setIsAddEntregaOpen(false)
    }
  })

  // Excludes THIS subject: the edit modal already carries its own slots
  // as editable rows, so counting the saved copy too would make every
  // untouched row warn about itself. Declared above the early returns —
  // hook order cannot depend on the query's state.
  const busySlots = useBusySlots(subjectId, now)

  if (isLoading) {
    return <p className="text-body-lg text-muted-foreground">{t('subjectDetailContainer.loading')}</p>
  }
  if (isError || !data) {
    return <p className="text-body-lg text-destructive">{t('subjectDetailContainer.loadError')}</p>
  }

  const nextClass = getNextClassOccurrence(data.slots, now)
  const progreso = computeProgreso(data.deadlines)
  const weeklyMinutes = computeWeeklyMinutes(data.slots)

  if (viewedAttachment !== null) {
    return (
      <AttachmentViewerContainer
        attachment={viewedAttachment}
        subjectId={subjectId}
        subjectName={data.name}
        onBack={() => setViewedAttachment(null)}
      />
    )
  }

  return (
    <>
      <SubjectDetail
        subject={data}
        nextClass={nextClass}
        progreso={progreso}
        weeklyMinutes={weeklyMinutes}
        now={now}
        onOpenExternalUrl={(url) => {
          void appApi.openExternal(url)
        }}
        onBack={onBack}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        origin={origin}
        apuntesCount={attachments?.length ?? 0}
        onEdit={() => setIsEditOpen(true)}
        onDelete={() => setIsDeleteOpen(true)}
        onAddEntrega={() => setIsAddEntregaOpen(true)}
        onCloseSubject={() => setIsCloseOpen(true)}
        // Class apuntes and uploaded files are ONE list, so this is the whole
        // APUNTES tab. `AdjuntosContainer` already routes a `.md` row — which
        // every apunte is — into the same full-screen editor the old apuntes
        // section opened, so nothing had to be re-wired for them.
        apuntesSlot={
          <AdjuntosContainer subjectId={subjectId} subjectName={data.name} onOpenMarkdown={setViewedAttachment} />
        }
        // Unconditional, unlike FINALES below: parciales belong to the
        // cursada itself, so they are recordable from the day the materia
        // exists — there is no outcome to reach first.
        parcialesSlot={<ParcialesContainer subjectId={subjectId} subjectName={data.name} parciales={data.parciales} />}
      />

      {/* Only once the student said the final is pending: before that there
          is nothing to record, and showing an empty mesa list on a subject
          still being cursada would invite noise. */}
      {data.outcome === 'finalPendiente' && (
        <FinalesContainer subjectId={subjectId} subjectName={data.name} program={data.program} finals={data.finals} />
      )}

      {isCloseOpen && (
        <CerrarMateriaModal
          subject={data}
          onSubmit={(input) => outcomeMutation.mutate(input)}
          onClose={() => setIsCloseOpen(false)}
        />
      )}

      {isAddEntregaOpen && (
        <NuevaEntregaModal
          mode="create"
          subjectId={subjectId}
          pending={createEntregaMutation.isPending}
          onSubmit={(input) => createEntregaMutation.mutate(input)}
          onClose={() => setIsAddEntregaOpen(false)}
        />
      )}

      {isEditOpen && (
        <EditarMateriaModal
          subject={data}
          busySlots={busySlots}
          programs={programs ?? []}
          // Correlativas are written through `planificador:*`, not through this
          // form's submit — their own lifecycle, their own channels, exactly
          // like parciales and mesas de final. The container below owns those
          // mutations; the modal only reserves the slot.
          correlativasSlot={<CorrelativasFieldContainer subjectId={subjectId} prerequisites={data.prerequisites} />}
          pending={updateMutation.isPending}
          onSubmit={(input) => updateMutation.mutate(input)}
          onClose={() => setIsEditOpen(false)}
          onDelete={() => {
            setIsEditOpen(false)
            setIsDeleteOpen(true)
          }}
        />
      )}

      {isDeleteOpen && (
        <DeleteSubjectConfirmDialog
          subjectName={data.name}
          deadlineCount={data.deadlines.length}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setIsDeleteOpen(false)}
        />
      )}
    </>
  )
}
