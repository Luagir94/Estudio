// Presentational (design "Approved design"): ADJUNTOS section — heading +
// "Agregar archivo" button (same treatment as SubjectDetail's existing
// "Agregar entrega" button), the "Alta parcial" warning banner, and the five
// states (vacío/cargando/error/lista/archivo no encontrado handled per-row).
// No data fetching, no IPC — that lives in AdjuntosContainer.
import { CircleAlert, Paperclip, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import type { AddAttachmentFailure, Attachment } from '../../../shared/ipc/adjuntos'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactive, interactiveLink } from '../../shared/lib/interactive'
import { formatAddFailureDetail, formatAddFailureSummary } from '../domain/attachmentDisplay'
import { AttachmentRow } from './AttachmentRow'

interface AdjuntosSectionProps {
  attachments: Attachment[]
  isLoading: boolean
  isError: boolean
  missingIds: ReadonlySet<number>
  addFailures: AddAttachmentFailure[]
  addAttemptedCount: number
  actionError: string | null
  onAdd: () => void
  onRetry: () => void
  onOpen: (attachment: Attachment) => void
  onDelete: (attachment: Attachment) => void
  /** Manual sync trigger (design "Approved design" — Sincronizar button, spec "Sincronizar button"). */
  onSync: () => void
}

function AttachmentRowSkeleton(): React.JSX.Element {
  return (
    <div
      data-testid="adjuntos-skeleton-row"
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5"
    >
      <span className="h-11 w-11 shrink-0 rounded-lg bg-muted" aria-hidden />
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="h-[10px] w-[190px] rounded-full bg-muted" aria-hidden />
        <span className="h-2 w-[108px] rounded-full bg-muted" aria-hidden />
      </div>
    </div>
  )
}

export function AdjuntosSection({
  attachments,
  isLoading,
  isError,
  missingIds,
  addFailures,
  addAttemptedCount,
  actionError,
  onAdd,
  onRetry,
  onOpen,
  onDelete,
  onSync
}: AdjuntosSectionProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-label font-semibold text-muted-foreground">ADJUNTOS</h3>
        <div className="flex items-center gap-2">
          {/* Secondary action (design "Approved design" — cornerRadius 8,
              padding 12px/16px, 16px icon, 13px semibold label, $surface-sunken
              bg + $border border + $text-secondary text/icon). Hand-styled
              rather than the shared `Button` primitive: `Button`'s base
              classes hardcode `text-body-lg font-medium` (14px/medium), and
              that custom theme font-size utility is not one tailwind-merge
              can override via `className`. */}
          <button
            type="button"
            onClick={onSync}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-3 text-body font-semibold text-secondary-foreground',
              interactive,
              'hover:bg-secondary/80 active:bg-secondary/70'
            )}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Sincronizar
          </button>
          <Button type="button" onClick={onAdd} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar archivo
          </Button>
        </div>
      </div>

      {actionError !== null && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p className="text-body-sm font-semibold text-warn">{actionError}</p>
        </div>
      )}

      {addFailures.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-body-sm font-semibold text-warn">
              {formatAddFailureSummary(addFailures.length, addAttemptedCount)}
            </p>
            {addFailures.map((failure) => (
              <p key={failure.fileName} className="text-caption text-muted-foreground">
                {formatAddFailureDetail(failure)}
              </p>
            ))}
          </div>
        </div>
      )}

      {isError ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col items-start gap-1">
            <p className="text-body font-semibold text-foreground">No se pudieron cargar los adjuntos</p>
            <button
              type="button"
              onClick={onRetry}
              className={cn('text-body-sm font-semibold text-primary-ink', interactiveLink)}
            >
              Reintentar
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          <AttachmentRowSkeleton />
          <AttachmentRowSkeleton />
          <AttachmentRowSkeleton />
        </div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-7 text-center">
          <Paperclip className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-body font-semibold text-secondary-foreground">Todavía no hay archivos</p>
          <p className="text-body-sm text-muted-foreground">Sumá apuntes, PDFs o fotos del pizarrón.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              isMissing={missingIds.has(attachment.id)}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
