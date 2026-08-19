// Presentational (design "Approved design — Attachment row"): mirrors the
// existing DeadlineRow idiom — card surface, 44px type chip on the sunken
// surface, name + meta, two 30x30 icon buttons. No data fetching, no IPC —
// that lives in AdjuntosContainer.
import { ExternalLink, FileText, FileX, Image, Trash2 } from 'lucide-react'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost, interactiveGhostDestructive } from '../../shared/lib/interactive'
import { formatAttachmentMeta, getFileExtension, resolveAttachmentKind } from '../domain/attachmentDisplay'

interface AttachmentRowProps {
  attachment: Attachment
  /**
   * True after an `adjuntos:open` attempt failed with `ATTACHMENT_FILE_MISSING`
   * (design "Archivo no encontrado" — the row stays in the list, it is never
   * auto-deleted; deleting is the user's decision).
   */
  isMissing: boolean
  onOpen: (attachment: Attachment) => void
  onDelete: (attachment: Attachment) => void
}

export function AttachmentRow({ attachment, isMissing, onOpen, onDelete }: AttachmentRowProps): React.JSX.Element {
  const extension = getFileExtension(attachment.fileName) || '—'
  const kind = resolveAttachmentKind(attachment.fileName)
  const Icon = isMissing ? FileX : kind === 'image' ? Image : FileText
  const chipColor = isMissing ? 'text-destructive' : 'text-muted-foreground'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-muted py-2">
        <Icon className={cn('h-3.5 w-3.5', chipColor)} aria-hidden />
        <span className={cn('text-[9px] font-semibold tracking-wide uppercase', chipColor)}>{extension}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg font-semibold text-foreground">{attachment.fileName}</span>
        {isMissing ? (
          <span className="text-body-sm text-destructive">No se encontró el archivo en disco</span>
        ) : (
          <span className="text-body-sm text-secondary-foreground">
            {formatAttachmentMeta(attachment.sizeBytes, attachment.createdAt)}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Abrir"
          onClick={() => onOpen(attachment)}
          className={cn(
            'flex h-[30px] w-[30px] items-center justify-center rounded-md bg-muted text-muted-foreground',
            interactiveGhost
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Eliminar"
          onClick={() => onDelete(attachment)}
          className={cn(
            'flex h-[30px] w-[30px] items-center justify-center rounded-md bg-muted text-muted-foreground',
            interactiveGhostDestructive
          )}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
