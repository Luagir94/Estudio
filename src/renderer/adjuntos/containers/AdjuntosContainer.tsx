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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AddAttachmentFailure, Attachment } from '../../../shared/ipc/adjuntos'
import { AdjuntosApiError, adjuntosApi } from '../adapters/adjuntosApi'
import { indexadoApi } from '../adapters/indexadoApi'
import { AdjuntosSection } from '../components/AdjuntosSection'
import { NuevoDocumentoModal } from '../components/NuevoDocumentoModal'
import { isMarkdownAttachment } from '../domain/markdownEditing'

interface AdjuntosContainerProps {
  subjectId: number
  /** Named in the "Nuevo documento" dialog so the student sees which materia they are writing for. */
  subjectName: string
  /**
   * In-app route for `.md` attachments (markdown-attachment-viewer): when
   * present, opening a markdown attachment calls this INSTEAD of the IPC
   * open — the host screen decides what "viewing" looks like. Absent, every
   * attachment keeps the OS open flow unchanged.
   */
  onOpenMarkdown?: (attachment: Attachment) => void
}

export function AdjuntosContainer({
  subjectId,
  subjectName,
  onOpenMarkdown
}: AdjuntosContainerProps): React.JSX.Element {
  const { t } = useTranslation('adjuntos')
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
  // The create failure is its OWN state, not `actionError`: the dialog stays
  // open on a failure and reports it in its own footer, and routing it
  // through `actionError` too would print the same sentence a second time on
  // the section behind the dialog.
  const [isNewDocumentOpen, setIsNewDocumentOpen] = useState(false)
  const [createDocumentError, setCreateDocumentError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => adjuntosApi.list(subjectId)
  })

  // Class apuntes ride on this same list — they ARE attachments, same file
  // storage, same editor, same FTS index — but ADJUNTOS is where course
  // material is browsed, and the subject detail already gives apuntes their
  // own section keyed by the class day. Showing them here would list every
  // apunte twice and bury the actual material under it.
  //
  // The filter is HERE and not in main on purpose: the viewer reads its
  // header row off this very query, so hiding apuntes at the IPC boundary
  // left the one screen that must open an apunte unable to find it. Which
  // rows a section shows is a display question.
  // No filter any more. Class apuntes used to be hidden here and shown in a
  // second APUNTES section built from the same query — one list split by one
  // column, drawn twice, counted twice, with its own tab. They are one list:
  // `AttachmentRow` tells a dated apunte from a file by that same `classDate`.
  const visibleAttachments = useMemo(() => data ?? [], [data])

  // Read from the WHOLE list, not `visibleAttachments`: `indexado:sync`
  // enqueues every pending attachment, apuntes included, so an apunte still
  // waiting to be indexed is something Sincronizar would genuinely do — even
  // though this section does not list it. Asking the filtered list instead
  // would hide the button while there was real work behind it.
  const hasSyncableDocuments = useMemo(() => (data ?? []).some((row) => row.indexStatus === 'pending'), [data])

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey })
  }

  // Main pushes `indexado:status-changed` once a background indexing job
  // finishes (design "Renderer notify") — this is what makes "Sincronizar"
  // (and upload-time indexing) actually surface updated badges, since the
  // sync call itself only returns `{enqueued}` before any indexing runs.
  // Scoped to THIS subject: a status change for another subject's attachment
  // must not refetch a list the user isn't even looking at.
  useEffect(() => {
    return indexadoApi.onStatusChanged((payload) => {
      if (payload.subjectId === subjectId) {
        void queryClient.invalidateQueries({ queryKey: ['adjuntos', subjectId] })
      }
    })
  }, [subjectId, queryClient])

  const syncMutation = useMutation({
    mutationFn: () => indexadoApi.sync(),
    onSuccess: () => {
      setActionError(null)
    },
    onError: () => {
      setActionError(t('adjuntosContainer.syncFailed'))
    }
  })

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
      setActionError(t('adjuntosContainer.addFailed'))
    }
  })

  const createDocumentMutation = useMutation({
    mutationFn: ({ name }: { name: string }) => adjuntosApi.createDocument(subjectId, name),
    onSuccess: (attachment) => {
      setCreateDocumentError(null)
      setIsNewDocumentOpen(false)
      invalidate()
      // "Crear y escribir": the dialog's whole promise is that the editor
      // opens on the document it just made. Without a markdown route the host
      // screen has nowhere to open it, so the row simply appears in the list —
      // the document still exists, which is the part that must not depend on
      // who mounted this container.
      onOpenMarkdown?.(attachment)
    },
    onError: () => {
      setCreateDocumentError(t('adjuntosContainer.createDocumentFailed'))
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
      setActionError(t('adjuntosContainer.openFailed'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (attachment: Attachment) => adjuntosApi.delete(attachment.id),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: () => {
      setActionError(t('adjuntosContainer.deleteFailed'))
    }
  })

  return (
    <>
      <AdjuntosSection
        attachments={visibleAttachments}
        isLoading={isLoading}
        isError={isError}
        missingIds={missingIds}
        addFailures={addFailures}
        addAttemptedCount={addAttemptedCount}
        actionError={actionError}
        hasSyncableDocuments={hasSyncableDocuments}
        isSyncing={syncMutation.isPending}
        onAdd={() => addMutation.mutate()}
        onNewDocument={() => {
          setCreateDocumentError(null)
          setIsNewDocumentOpen(true)
        }}
        onRetry={() => void refetch()}
        onOpen={(attachment) => {
          if (onOpenMarkdown && isMarkdownAttachment(attachment.fileName)) {
            onOpenMarkdown(attachment)
            return
          }
          openMutation.mutate(attachment)
        }}
        onDelete={(attachment) => deleteMutation.mutate(attachment)}
        onSync={() => syncMutation.mutate()}
      />

      {isNewDocumentOpen && (
        <NuevoDocumentoModal
          subjectId={subjectId}
          subjectName={subjectName}
          // The dialog stays open on a failure and shows it in its own footer:
          // the name the student typed is still in the field, and closing
          // would throw it away along with the only thing they had to retry.
          error={createDocumentError}
          pending={createDocumentMutation.isPending}
          onSubmit={({ name }) => createDocumentMutation.mutate({ name })}
          onClose={() => {
            setCreateDocumentError(null)
            setIsNewDocumentOpen(false)
          }}
        />
      )}
    </>
  )
}
