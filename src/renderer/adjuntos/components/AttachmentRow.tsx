// Presentational (design "Approved design — Attachment row"): mirrors the
// existing DeadlineRow idiom — card surface, 44px type chip on the sunken
// surface, name + meta, two 30x30 icon buttons. No data fetching, no IPC —
// that lives in AdjuntosContainer.
import {
  Check,
  ExternalLink,
  FileText,
  FileX,
  Hourglass,
  Image,
  type LucideIcon,
  SearchX,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { cn } from '../../shared/lib/cn'
import { interactiveGhost, interactiveGhostDestructive } from '../../shared/lib/interactive'
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
  const badge = indexBadgeFor(attachment.indexStatus)
  const BadgeIcon = INDEX_BADGE_ICON_COMPONENTS[badge.icon]
  const originBadge = originBadgeFor(attachment.origin)
  const OriginBadgeIconComponent = originBadge ? ORIGIN_BADGE_ICON_COMPONENTS[originBadge.icon] : null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5">
      <span className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-muted py-[5px]">
        <Icon className={cn('h-3.5 w-3.5', chipColor)} aria-hidden />
        <span className={cn('text-[9px] font-semibold tracking-wide uppercase', chipColor)}>{extension}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg font-semibold text-foreground">{attachment.fileName}</span>
        {isMissing ? (
          <span className="text-body-sm text-destructive">{t('attachmentRow.missing')}</span>
        ) : (
          <span className="text-body-sm text-secondary-foreground">
            {formatAttachmentMeta(attachment.sizeBytes, attachment.createdAt)}
          </span>
        )}
      </div>

      {/* Origin provenance badge (cli-generated-artifacts spec "Origin
          provenance column and badge") — additive, sits BESIDE the index
          status badge below; absent entirely for a normal user upload. */}
      {originBadge && OriginBadgeIconComponent && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-[5px] rounded-md px-2 py-1 text-caption font-semibold',
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
          'inline-flex shrink-0 items-center gap-[5px] rounded-md px-2 py-1 text-caption font-semibold',
          badge.classes
        )}
      >
        <BadgeIcon className="h-3 w-3" aria-hidden="true" />
        {badge.label}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={t('attachmentRow.open')}
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
          aria-label={t('attachmentRow.delete')}
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
