// Pure, framework-free formatting for the ADJUNTOS section (design "Approved
// design" — attachment row meta, the type chip's extension label, and the
// "Alta parcial" banner copy). No electron/IPC import — same convention as
// `entregas/domain/deadline.ts`.
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AddAttachmentFailure, Attachment } from '../../../shared/ipc/adjuntos'
import i18n from '../../i18n'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])

const BYTES_PER_MB = 1024 * 1024

/** Uppercased extension for the type chip's label (`PDF`, `DOCX`, `JPG`). Empty when the name has none. */
export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return ''
  }
  return fileName.slice(dotIndex + 1).toUpperCase()
}

export type AttachmentKind = 'document' | 'image'

/** Everything that isn't a recognized image extension renders as a document (design: `FileText` icon default). */
export function resolveAttachmentKind(fileName: string): AttachmentKind {
  const extension = getFileExtension(fileName).toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'document'
}

/** `sizeBytes` → `"2,4 MB"` — one decimal, Spanish comma separator (design meta format). */
export function formatAttachmentSize(sizeBytes: number): string {
  const megabytes = sizeBytes / BYTES_PER_MB
  const rounded = Math.round(megabytes * 10) / 10
  return i18n.t('adjuntos:attachmentDisplay.sizeMb', { value: rounded.toFixed(1).replace('.', ',') })
}

/** Local-naive `createdAt` (same convention as `entregas/domain/deadline.ts`) → `"12 ago"`. */
export function formatAttachmentDate(createdAt: string): string {
  return format(parseISO(createdAt), 'd MMM', { locale: es })
}

/** `"2,4 MB · 12 ago"` — the row's meta line. */
export function formatAttachmentMeta(sizeBytes: number, createdAt: string): string {
  return i18n.t('adjuntos:attachmentDisplay.meta', {
    size: formatAttachmentSize(sizeBytes),
    date: formatAttachmentDate(createdAt)
  })
}

// --- viewer header meta (markdown-attachment-viewer design) ---------------

const BYTES_PER_KB = 1024

/**
 * The viewer's own size step: KB below 1 MB (a 8,2 KB markdown file must not
 * read "0,0 MB" the way `formatAttachmentSize` would render it), MB from
 * there up — one decimal, Spanish comma, same convention as the row meta.
 */
export function formatViewerSize(sizeBytes: number): string {
  if (sizeBytes < BYTES_PER_MB) {
    const kilobytes = Math.round((sizeBytes / BYTES_PER_KB) * 10) / 10
    return i18n.t('adjuntos:attachmentDisplay.sizeKb', { value: kilobytes.toFixed(1).replace('.', ',') })
  }
  return formatAttachmentSize(sizeBytes)
}

export type ViewerMode = 'vista' | 'edicion'

/** `"8,2 KB · Editado 18 ago"` (vista) / `"8,2 KB · Editando ahora"` (edición) — the viewer header's meta line. */
export function formatViewerMeta(sizeBytes: number, createdAt: string, mode: ViewerMode): string {
  const size = formatViewerSize(sizeBytes)
  if (mode === 'edicion') {
    return i18n.t('adjuntos:attachmentDisplay.viewerMetaEdicion', { size })
  }
  return i18n.t('adjuntos:attachmentDisplay.viewerMetaVista', { size, date: formatAttachmentDate(createdAt) })
}

/** "Alta parcial" banner's count line, e.g. `"1 de 3 archivos no se agregó"` — built from the real counts, never hardcoded. */
export function formatAddFailureSummary(failureCount: number, attemptedCount: number): string {
  // Two independent plurals in one sentence: "archivo(s)" follows the
  // attempted count while the verb follows the failure count, so each word is
  // resolved through its own `_one`/`_other` pair before the sentence joins.
  return i18n.t('adjuntos:attachmentDisplay.addFailureSummary', {
    failureCount,
    attemptedCount,
    file: i18n.t('adjuntos:attachmentDisplay.addFailureFile', { count: attemptedCount }),
    verb: i18n.t('adjuntos:attachmentDisplay.addFailureVerb', { count: failureCount })
  })
}

/** "Alta parcial" banner's per-file detail line, built from the real `failures` entry. */
export function formatAddFailureDetail(failure: AddAttachmentFailure): string {
  if (failure.code === 'FILE_TOO_LARGE') {
    return i18n.t('adjuntos:attachmentDisplay.addFailureTooLarge', { fileName: failure.fileName })
  }
  return i18n.t('adjuntos:attachmentDisplay.addFailureCopyFailed', { fileName: failure.fileName })
}

// --- index status badge (attachment-fts-index design "Renderer Delta") ----

export type IndexStatus = Attachment['indexStatus']

/**
 * Identifier only — NOT a lucide component. Kept framework-free (same
 * convention as `resolveAttachmentKind`'s `AttachmentKind`); the
 * presentational layer (`AttachmentRow.tsx`) maps this to the actual icon.
 */
export type IndexBadgeIcon = 'check' | 'hourglass' | 'search-x'

export interface IndexBadgeInfo {
  label: string
  icon: IndexBadgeIcon
  /** Tailwind utility classes for the approved .pen tokens (bg + text). */
  classes: string
}

const INDEX_BADGES: Record<IndexStatus, IndexBadgeInfo> = {
  indexed: {
    label: i18n.t('adjuntos:attachmentDisplay.indexBadge.indexed'),
    icon: 'check',
    classes: 'bg-ok-soft text-ok'
  },
  pending: {
    label: i18n.t('adjuntos:attachmentDisplay.indexBadge.pending'),
    icon: 'hourglass',
    classes: 'bg-warn-soft text-warn'
  },
  'not-indexable': {
    label: i18n.t('adjuntos:attachmentDisplay.indexBadge.notIndexable'),
    icon: 'search-x',
    classes: 'bg-surface-sunken text-muted-foreground'
  }
}

/** Closed 3-state mapping (spec "Index status badge") — matches the approved .pen tokens exactly. */
export function indexBadgeFor(status: IndexStatus): IndexBadgeInfo {
  return INDEX_BADGES[status]
}

// --- origin provenance badge (cli-generated-artifacts design "Renderer
// Delta") --------------------------------------------------------------

export type AttachmentOrigin = Attachment['origin']

/** Identifier only — NOT a lucide component (same convention as `IndexBadgeIcon`). */
export type OriginBadgeIcon = 'sparkles'

export interface OriginBadgeInfo {
  label: string
  icon: OriginBadgeIcon
  /** Tailwind utility classes for the approved .pen tokens (bg + text). */
  classes: string
}

/** Only `'ai-generated'` gets a badge — a normal upload renders nothing extra. */
const ORIGIN_BADGES: Partial<Record<AttachmentOrigin, OriginBadgeInfo>> = {
  'ai-generated': {
    label: i18n.t('adjuntos:attachmentDisplay.originBadgeAi'),
    icon: 'sparkles',
    classes: 'bg-brand-soft text-primary-ink'
  }
}

/**
 * Mirrors `indexBadgeFor`'s exact shape (spec "Origin provenance column and
 * badge"), but returns `null` instead of a badge for `'user'` — the badge is
 * additive, not a 1:1 status mapping.
 */
export function originBadgeFor(origin: AttachmentOrigin): OriginBadgeInfo | null {
  return ORIGIN_BADGES[origin] ?? null
}
