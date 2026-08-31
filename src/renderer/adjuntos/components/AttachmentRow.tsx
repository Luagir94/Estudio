// Presentational (design "Approved design — Attachment row"): mirrors the
// existing DeadlineRow idiom — card surface, 44px type chip on the sunken
// surface, name + meta. The row itself opens the attachment and carries ONE
// trailing control, the delete glyph. No data fetching, no IPC — that lives
// in AdjuntosContainer.
import { Check, FileText, FileX, Hourglass, Image, type LucideIcon, SearchX, Sparkles, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { Button } from '../../shared/components/ui/button'
import { cn } from '../../shared/lib/cn'
import { interactiveGhostDestructive, interactiveSurface } from '../../shared/lib/interactive'
import {
  formatAttachmentMeta,
  getFileExtension,
  indexBadgeFor,
  type IndexBadgeIcon,
  type OriginBadgeIcon,
  originBadgeFor,
  resolveAttachmentKind
} from '../domain/attachmentDisplay'

// Presentational icon-name → component map (same convention as
// `AskTranscript.tsx`'s `SECTION_ICONS`) — the domain layer stays
// framework-free and returns only the identifier.
const INDEX_BADGE_ICON_COMPONENTS: Record<IndexBadgeIcon, LucideIcon> = {
  check: Check,
  hourglass: Hourglass,
  'search-x': SearchX
}

const ORIGIN_BADGE_ICON_COMPONENTS: Record<OriginBadgeIcon, LucideIcon> = {
  sparkles: Sparkles
}

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
  const { t } = useTranslation('adjuntos')
  const extension = getFileExtension(attachment.fileName) || '—'
  const kind = resolveAttachmentKind(attachment.fileName)
  const Icon = isMissing ? FileX : kind === 'image' ? Image : FileText
  const chipColor = isMissing ? 'text-destructive' : 'text-muted-foreground'
  // A class apunte is an attachment like any other — `classDate` is the only
  // thing that ever set them apart, and it used to be a whole second section.
  // The date takes over the type chip, because "MD" answers nothing about an
  // apunte while its class answers everything.
  const classDate = attachment.classDate
  const monthLabels = t('common:monthsCaps', { returnObjects: true }) as string[]
  // Split rather than `new Date(...)`: `classDate` is a LOCAL `YYYY-MM-DD`,
  // and Date parses that as UTC — which lands on the previous day for every
  // student west of Greenwich, this app's entire audience.
  const [, classMonth = '', classDay = ''] = classDate?.split('-') ?? []
  // The apunte's own first line (`classNotePreview`, stored as `title`) is what
  // you recognise it by; its filename is just the date, which the chip says.
  const displayName = classDate !== null ? (attachment.title ?? attachment.fileName) : attachment.fileName
  const badge = indexBadgeFor(attachment.indexStatus)
  const BadgeIcon = INDEX_BADGE_ICON_COMPONENTS[badge.icon]
  const originBadge = originBadgeFor(attachment.origin)
  const OriginBadgeIconComponent = originBadge ? ORIGIN_BADGE_ICON_COMPONENTS[originBadge.icon] : null

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5">
      {/* The ROW is the open affordance now (approved design), which is also
          what every other row in the app already does — MateriasList,
          ParcialesSection and ApuntesSection rows are all buttons. This one
          was the outlier, and its separate "abrir" icon button was the price:
          two icon buttons per row meant ten of them over five attachments.
          A stretched overlay rather than a wrapping <button>, because the
          delete control lives inside the row and buttons cannot nest. */}
      <button
        type="button"
        aria-label={t('attachmentRow.openNamed', { name: displayName })}
        onClick={() => onOpen(attachment)}
        className={cn('absolute inset-0 rounded-lg', interactiveSurface)}
      />
      {/* Same 44px chip either way — a dated apunte and an uploaded file are
          peers in one list, so they cannot sit on two different grids. */}
      <span className="pointer-events-none relative flex w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-muted py-[5px]">
        {classDate !== null ? (
          <span className="font-display text-body-lg leading-none font-semibold text-foreground">{classDay}</span>
        ) : (
          <Icon className={cn('h-3.5 w-3.5', chipColor)} aria-hidden />
        )}
        <span className={cn('text-[9px] font-semibold tracking-wide uppercase', chipColor)}>
          {classDate !== null ? (monthLabels[Number(classMonth) - 1] ?? '') : extension}
        </span>
      </span>

      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg font-semibold text-foreground">{displayName}</span>
        {isMissing ? (
          <span className="text-body-sm text-destructive">{t('attachmentRow.missing')}</span>
        ) : (
          <span className="text-body-sm text-secondary-foreground">
            {classDate !== null
              ? t('attachmentRow.classNoteMeta')
              : formatAttachmentMeta(attachment.sizeBytes, attachment.createdAt)}
          </span>
        )}
      </div>

      {/* Origin provenance badge (cli-generated-artifacts spec "Origin
          provenance column and badge") — additive, sits BESIDE the index
          status badge below; absent entirely for a normal user upload. */}
      {originBadge && OriginBadgeIconComponent && (
        <span
          className={cn(
            'pointer-events-none relative inline-flex shrink-0 items-center gap-[5px] rounded-md px-2 py-1 text-caption font-semibold',
            originBadge.classes
          )}
        >
          <OriginBadgeIconComponent className="h-3 w-3" aria-hidden="true" />
          {originBadge.label}
        </span>
      )}

      {/* Index status badge (design "Approved design — Attachment row" /
          spec "Index status badge") — cornerRadius 6, gap 5px, padding
          4px/8px, 12px icon, 11px semibold label, matching the .pen values
          exactly on the existing `@theme` tokens (no new tokens needed). */}
      <span
        className={cn(
          'pointer-events-none relative inline-flex shrink-0 items-center gap-[5px] rounded-md px-2 py-1 text-caption font-semibold',
          badge.classes
        )}
      >
        <BadgeIcon className="h-3 w-3" aria-hidden="true" />
        {badge.label}
      </span>

      {/* A bare glyph, not a filled chip (approved design): deleting is the
          rare, destructive half of the row, and five filled chips down the
          list read as five things asking to be pressed. The name rides in the
          label because five identical "Eliminar" buttons name nothing. */}
      <Button
        variant="ghost"
        size="compactIcon"
        aria-label={t('attachmentRow.deleteNamed', { name: displayName })}
        onClick={() => onDelete(attachment)}
        className={cn('pointer-events-auto relative shrink-0 text-muted-foreground', interactiveGhostDestructive)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  )
}
