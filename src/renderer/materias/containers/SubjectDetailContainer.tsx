// Container (design §4): owns data fetching (TanStack Query, key
// ['materias','detail',id]) and ephemeral edit/delete-dialog open state;
// computes the pure subject-detail read model (próxima clase/progreso/
// horas-semana) at RENDER time from the fetched raw records — "now" is a
// rendering-time concern, not baked into the cached query payload.
//
// Design (node `TYFvB`, verified via the Pencil MCP tools) puts "Editar
// materia" in the detail screen's own header and moves "Eliminar materia"
// into the Editar materia modal's footer (node `hjivW`/`INZOe`) — there is
// no standalone delete button on the detail screen itself.
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
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AdjuntosContainer } from '../../adjuntos/containers/AdjuntosContainer'
import { AttachmentViewerContainer } from '../../adjuntos/containers/AttachmentViewerContainer'
import { ApuntesContainer } from '../../clases/containers/ApuntesContainer'
import { entregasApi } from '../../entregas/adapters/entregasApi'
import { NuevaEntregaModal } from '../../entregas/components/NuevaEntregaModal'
import { computeProgreso, computeWeeklyMinutes, getNextClassOccurrence } from '../domain/subjectDetail'
import { appApi } from '../../shared/adapters/appApi'
import { materiasApi } from '../adapters/materiasApi'
import { CerrarMateriaModal } from '../components/CerrarMateriaModal'
import { DeleteSubjectConfirmDialog } from '../components/DeleteSubjectConfirmDialog'
import { carrerasApi } from '../../carreras/adapters/carrerasApi'
import { EditarMateriaModal } from '../components/EditarMateriaModal'
import { useBusySlots } from './useBusySlots'
import { SubjectDetail } from '../components/SubjectDetail'
import { FinalesContainer } from '../../finales/containers/FinalesContainer'
import { ParcialesContainer } from '../../parciales/containers/ParcialesContainer'
import { CorrelativasFieldContainer } from '../../planificador/containers/CorrelativasFieldContainer'

interface SubjectDetailContainerProps {
  subjectId: number
  onBack: () => void
  /** Injection point for deterministic "próxima clase" tests. Defaults to the real clock. */
  now?: Date
}

export function SubjectDetailContainer({
  subjectId,
  onBack,
  now = new Date()
}: SubjectDetailContainerProps): React.JSX.Element {
  const { t } = useTranslation('materias')
  const queryClient = useQueryClient()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isAddEntregaOpen, setIsAddEntregaOpen] = useState(false)
  const [isCloseOpen, setIsCloseOpen] = useState(false)
  // markdown-attachment-viewer: while set, the full-screen viewer renders
  // INSTEAD of the detail screen — the exact MateriasContainer
  // selectedSubjectId pattern, one level further down.
  const [viewedAttachment, setViewedAttachment] = useState<Attachment | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['materias', 'detail', subjectId],
    queryFn: () => materiasApi.detail(subjectId)
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
        onEdit={() => setIsEditOpen(true)}
        onAddEntrega={() => setIsAddEntregaOpen(true)}
        onCloseSubject={() => setIsCloseOpen(true)}
        adjuntosSlot={<AdjuntosContainer subjectId={subjectId} onOpenMarkdown={setViewedAttachment} />}
        // Unconditional, unlike FINALES below: parciales belong to the
        // cursada itself, so they are recordable from the day the materia
        // exists — there is no outcome to reach first.
        parcialesSlot={<ParcialesContainer subjectId={subjectId} subjectName={data.name} parciales={data.parciales} />}
        // Also unconditional: apuntes belong to the cursada, and the section
        // is a read surface with its own empty state. The SLOTS go with them
        // because the class dialog composes its occurrence out of the weekly
        // pattern — nothing dated is stored to read a time off.
        apuntesSlot={
          <ApuntesContainer
            subjectId={subjectId}
            subjectName={data.name}
            slots={data.slots}
            notes={data.classNotes}
            attendance={data.attendance}
          />
        }
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
