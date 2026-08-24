// Presentational (design "Approved design"): ADJUNTOS section — heading +
// "Agregar archivo" button (same treatment as SubjectDetail's existing
// "Agregar entrega" button), the "Alta parcial" warning banner, and the five
// states (vacío/cargando/error/lista/archivo no encontrado handled per-row).
// No data fetching, no IPC — that lives in AdjuntosContainer.
import { CircleAlert, Paperclip, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5"
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
  const { t } = useTranslation('adjuntos')
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {/* Approved design: the heading carries the total count ("ADJUNTOS · 5")
            — appended outside the translation so the i18n key stays intact. */}
        <h3 className="text-label font-semibold text-muted-foreground">
          {t('adjuntosSection.heading')}
          {attachments.length > 0 && ` · ${attachments.length}`}
        </h3>
        <div className="flex items-center gap-2">
          {/* Secondary action (design "Approved design" — cornerRadius 8,
              padding 7px/12px, 14px icon, 12px semibold label, $surface-sunken
              bg + $border border + $text-secondary text/icon). Hand-styled
              rather than the shared `Button` primitive: `Button`'s base
              classes hardcode `text-body-lg font-medium` (14px/medium), and
              that custom theme font-size utility is not one tailwind-merge
              can override via `className`. */}
          <button
            type="button"
            onClick={onSync}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-[7px] text-body font-semibold text-secondary-foreground',
              interactive,
              'hover:bg-secondary/80 active:bg-secondary/70'
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('adjuntosSection.sync')}
          </button>
          {/* Compact primary action — same treatment (and same tailwind-merge
              ink caveat) as SubjectDetail's "Agregar entrega" button. */}
          <Button
            type="button"
            onClick={onAdd}
            className="h-auto gap-2 px-3 py-[7px] text-body-sm font-semibold [color:var(--color-primary-foreground)]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('adjuntosSection.addFile')}
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
            <p className="text-body font-semibold text-foreground">{t('adjuntosSection.loadError')}</p>
            <button
              type="button"
              onClick={onRetry}
              className={cn('text-body-sm font-semibold text-primary-ink', interactiveLink)}
            >
              {t('adjuntosSection.retry')}
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-1.5">
          <AttachmentRowSkeleton />
          <AttachmentRowSkeleton />
          <AttachmentRowSkeleton />
        </div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-7 text-center">
          <Paperclip className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-body font-semibold text-secondary-foreground">{t('adjuntosSection.emptyTitle')}</p>
          <p className="text-body-sm text-muted-foreground">{t('adjuntosSection.emptyHint')}</p>
        </div>
      ) : (
        // Approved design: the cap applies ONLY below 900px of viewport
        // height (design responsive rule) — with vertical room the list
        // grows freely. When capped: at most 4 rows visible (232px =
        // 4 x 50px rows + 3 x 6px gaps + an 8px sliver of row 5 as the
        // scroll cue); overflow scrolls inside the list, never the page.
        <div className="flex flex-col gap-1.5 [@media(max-height:900px)]:max-h-[232px] [@media(max-height:900px)]:overflow-y-auto">
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
