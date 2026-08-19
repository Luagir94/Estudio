// Container (design "Approved design" / "Renderer (PR3 — design-gated)"):
// owns data fetching (TanStack Query, key ['adjuntos', subjectId]) and the
// mutations for add/open/delete. Mounted inside Subject Detail exactly like
// FinalesContainer (SubjectDetailContainer.tsx) — same cross-domain-slice
// precedent, this domain has no screen of its own.
//
// Add and delete invalidate ONLY ['adjuntos', subjectId] (attachments are
// not part of the `materias:detail` payload, so no other cache goes stale).
// Open never invalidates — it does not change the attachment list, only
// whether THIS row currently renders as "Archivo no encontrado", which is
// local, ephemeral UI state, not server state.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { AddAttachmentFailure, Attachment } from '../../../shared/ipc/adjuntos'
import { AdjuntosApiError, adjuntosApi } from '../adapters/adjuntosApi'
import { AdjuntosSection } from '../components/AdjuntosSection'

interface AdjuntosContainerProps {
  subjectId: number
}

export function AdjuntosContainer({ subjectId }: AdjuntosContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const queryKey = ['adjuntos', subjectId]

  // "Archivo no encontrado" (design) is per-row, ephemeral UI state driven by
  // the last `adjuntos:open` outcome — it is never part of the fetched list,
  // since main only learns a file is missing when it actually tries to open it.
  const [missingIds, setMissingIds] = useState<ReadonlySet<number>>(new Set())
  const [addFailures, setAddFailures] = useState<AddAttachmentFailure[]>([])
  const [addAttemptedCount, setAddAttemptedCount] = useState(0)

  // Channel-level failure (adjuntos:add / adjuntos:open / adjuntos:delete
  // rejecting with an AdjuntosApiError) — distinct from `addFailures`, which
  // is the per-file partial-add result on a SUCCESSFUL `adjuntos:add` call.
  // Cleared whenever any mutation succeeds so a stale message never lingers.
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => adjuntosApi.list(subjectId)
  })

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey })
  }

  const addMutation = useMutation({
    mutationFn: () => adjuntosApi.add(subjectId),
    onSuccess: (result) => {
      setActionError(null)
      setAddFailures(result.failures)
      setAddAttemptedCount(result.added.length + result.failures.length)
      if (result.added.length > 0) {
        invalidate()
      }
    },
    onError: () => {
      setActionError('No se pudo agregar el archivo')
    }
  })

  const openMutation = useMutation({
    mutationFn: (attachment: Attachment) => adjuntosApi.open(attachment.id),
    onSuccess: (_result, attachment) => {
      setActionError(null)
      setMissingIds((prev) => {
        if (!prev.has(attachment.id)) {
          return prev
        }
        const next = new Set(prev)
        next.delete(attachment.id)
        return next
      })
    },
    onError: (error, attachment) => {
      if (error instanceof AdjuntosApiError && error.code === 'ATTACHMENT_FILE_MISSING') {
        setMissingIds((prev) => new Set(prev).add(attachment.id))
        return
      }
      setActionError('No se pudo abrir el archivo')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (attachment: Attachment) => adjuntosApi.delete(attachment.id),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: () => {
      setActionError('No se pudo eliminar el adjunto')
    }
  })

  return (
    <AdjuntosSection
      attachments={data ?? []}
      isLoading={isLoading}
      isError={isError}
      missingIds={missingIds}
      addFailures={addFailures}
      addAttemptedCount={addAttemptedCount}
      actionError={actionError}
      onAdd={() => addMutation.mutate()}
      onRetry={() => void refetch()}
      onOpen={(attachment) => openMutation.mutate(attachment)}
      onDelete={(attachment) => deleteMutation.mutate(attachment)}
    />
  )
}
