// Presentational (design "Approved design"): ADJUNTOS section — heading +
// "Agregar archivo" button (same treatment as SubjectDetail's existing
// "Agregar entrega" button), the "Alta parcial" warning banner, and the five
// states (vacío/cargando/error/lista/archivo no encontrado handled per-row).
// No data fetching, no IPC — that lives in AdjuntosContainer.
import { ChevronDown, CircleAlert, FilePlus, Paperclip, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AddAttachmentFailure, Attachment } from '../../../shared/ipc/adjuntos'
import { TabActionSlot } from '../../shared/components/tabActionSlot'
import { ActionMenu } from '../../shared/components/ui/action-menu'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveLink } from '../../shared/lib/interactive'
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
  /**
   * Whether anything of this materia is still waiting to be indexed.
   *
   * It gates the Sincronizar button's very PRESENCE (approved design,
   * "CABECERA DE ADJUNTOS"): with nothing pending there is nothing to
   * reintentar, and a button that provably does nothing teaches the student
   * that the screen is lying to them. Computed from the whole attachment
   * list, apuntes included — an apunte waiting to be indexed is as syncable
   * as any other document, even though this section does not list it.
   */
  hasSyncableDocuments: boolean
  /**
   * True while `indexado:sync` is in flight. The button locks and its icon
   * spins — without it the click has no answer at all, since the only other
   * feedback is a badge that moves whenever the background job happens to
   * finish, which can be much later or never.
   */
  isSyncing: boolean
  onAdd: () => void
  /** Opens the "Nuevo documento" dialog — the create-from-a-name path into the markdown editor. */
  onNewDocument: () => void
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
  hasSyncableDocuments,
  isSyncing,
  onAdd,
  onNewDocument,
  onRetry,
  onOpen,
  onDelete,
  onSync
}: AdjuntosSectionProps): React.JSX.Element {
  const { t } = useTranslation('adjuntos')
  return (
    // No heading of its own: inside the subject detail the ADJUNTOS tab names
    // this section AND carries the count that used to hang off the <h3>. The
    // name survives as the accessible label.
    <section className="flex flex-col gap-2" aria-label={t('adjuntosSection.heading')}>
      {/* Both actions travel to the tab bar's action slot; outside a tab bar
          they render right here. */}
      <TabActionSlot>
        {hasSyncableDocuments && (
          // Icon only (approved design): sincronizar is maintenance, not
          // something you come to this section to do, and three labelled
          // buttons in one row was the densest spot on the screen.
          //
          // In-flight treatment borrowed wholesale from Ajustes'
          // ConnectionStatusCard re-probe chip: same RefreshCw, spun,
          // disabled and `aria-busy`.
          <Button
            variant="secondary"
            size="compactIcon"
            onClick={onSync}
            disabled={isSyncing}
            aria-busy={isSyncing}
            aria-label={t('adjuntosSection.sync')}
            className="shrink-0 border border-border disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} aria-hidden="true" />
          </Button>
        )}
        {/* One entry point for both creation paths (approved design). They
            were two buttons doing the same job — putting something into
            ADJUNTOS — and two buttons for one job is exactly what made this
            row too busy. */}
        <ActionMenu
          label={t('adjuntosSection.add')}
          trigger={
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('adjuntosSection.add')}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </>
          }
          items={[
            { id: 'file', label: t('adjuntosSection.addFile'), icon: Plus, onSelect: onAdd },
            { id: 'document', label: t('adjuntosSection.newDocument'), icon: FilePlus, onSelect: onNewDocument }
          ]}
        />
      </TabActionSlot>

      {/* `role="alert"` on the BOX, not the sentence: the icon carries the
          "this went wrong" half of the message visually, and a reader that
          announced only the paragraph would drop it. Both banners appear
          asynchronously, after the click that caused them is long past. */}
      {actionError !== null && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p className="text-body-sm font-semibold text-warn">{actionError}</p>
        </div>
      )}

      {addFailures.length > 0 && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5">
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
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col items-start gap-1">
            <p className="text-body-lg font-semibold text-foreground">{t('adjuntosSection.loadError')}</p>
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
