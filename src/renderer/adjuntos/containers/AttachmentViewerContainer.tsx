// Container (markdown-attachment-viewer): owns the content query
// (['adjunto-contenido', id]), the vista/edición mode, the draft + dirty
// state, the save/open mutations, and the indexado subscription. No styling
// JSX — everything renders through the presentational AttachmentViewer.
//
// The draft is `string | null`: null means "no edit session". Entering
// Edición seeds it from the loaded content; Cancelar and a successful save
// drop it back to null, so re-entering always re-seeds from the (fresh)
// saved content. `dirty` is DERIVED (draft differs from content), never a
// second flag to keep in sync.
//
// The header renders from the FRESH row in the ['adjuntos', subjectId]
// cache when available (badges/sizes move after a save reindexes), falling
// back to the snapshot the navigation handed over.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { AdjuntosApiError, adjuntosApi } from '../adapters/adjuntosApi'
import { indexadoApi } from '../adapters/indexadoApi'
import { AttachmentViewer } from '../components/AttachmentViewer'
import type { ViewerMode } from '../domain/attachmentDisplay'
import { applyToolbarAction, type ToolbarAction } from '../domain/markdownEditing'

interface AttachmentViewerContainerProps {
  /** Snapshot handed over by the navigation — superseded by the fresh list row when the cache has one. */
  attachment: Attachment
  subjectId: number
  subjectName: string
  onBack: () => void
}

export function AttachmentViewerContainer({
  attachment,
  subjectId,
  subjectName,
  onBack
}: AttachmentViewerContainerProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ViewerMode>('vista')
  const [draft, setDraft] = useState<string | null>(null)
  const [editorSelection, setEditorSelection] = useState<{ start: number; end: number } | null>(null)

  const contentQuery = useQuery({
    queryKey: ['adjunto-contenido', attachment.id],
    queryFn: () => adjuntosApi.read(attachment.id)
  })

  // Same key AdjuntosContainer uses — shares its cache when the list screen
  // fetched it already, fetches once here otherwise.
  const { data: attachments } = useQuery({
    queryKey: ['adjuntos', subjectId],
    queryFn: () => adjuntosApi.list(subjectId)
  })
  const freshAttachment = attachments?.find((row) => row.id === attachment.id) ?? attachment

  // Same subscription AdjuntosContainer holds: a finished (re)index job for
  // THIS subject refreshes the list row this header renders from.
  useEffect(() => {
    return indexadoApi.onStatusChanged((payload) => {
      if (payload.subjectId === subjectId) {
        void queryClient.invalidateQueries({ queryKey: ['adjuntos', subjectId] })
      }
    })
  }, [subjectId, queryClient])

  const saveMutation = useMutation({
    mutationFn: (content: string) => adjuntosApi.write(attachment.id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adjuntos', subjectId] })
      void queryClient.invalidateQueries({ queryKey: ['adjunto-contenido', attachment.id] })
      setDraft(null)
      setEditorSelection(null)
      setMode('vista')
    }
    // A failed save keeps the edit session open, dirty badge and all — the
    // draft is the user's work and must survive the failure.
  })

  const openMutation = useMutation({
    mutationFn: () => adjuntosApi.open(attachment.id)
  })

  const content = contentQuery.data
  const isMissing =
    contentQuery.error instanceof AdjuntosApiError && contentQuery.error.code === 'ATTACHMENT_FILE_MISSING'

  function handleModeChange(nextMode: ViewerMode): void {
    if (nextMode === 'edicion' && draft === null) {
      setDraft(content ?? '')
    }
    setMode(nextMode)
  }

  function handleToolbarAction(action: ToolbarAction, selection: { start: number; end: number }): void {
    const result = applyToolbarAction(draft ?? '', action, selection.start, selection.end)
    setDraft(result.text)
    // A fresh object every time — the component's effect re-applies it even
    // when two consecutive actions land on identical positions.
    setEditorSelection({ start: result.selectionStart, end: result.selectionEnd })
  }

  return (
    <AttachmentViewer
      attachment={freshAttachment}
      subjectName={subjectName}
      mode={mode}
      content={content}
      draft={draft ?? ''}
      dirty={draft !== null && draft !== (content ?? '')}
      isLoading={contentQuery.isLoading}
      isError={contentQuery.isError && !isMissing}
      isMissing={isMissing}
      editorSelection={editorSelection}
      onBack={onBack}
      onModeChange={handleModeChange}
      onDraftChange={setDraft}
      onSave={() => saveMutation.mutate(draft ?? '')}
      onCancel={() => {
        setDraft(null)
        setEditorSelection(null)
        setMode('vista')
      }}
      onOpenExternal={() => openMutation.mutate()}
      onToolbarAction={handleToolbarAction}
    />
  )
}
