// Presentational (markdown-attachment-viewer design — the full-screen Vista/
// Edición screen). Everything arrives via props: no data fetching, no IPC,
// no mutations — that lives in AttachmentViewerContainer. The ONLY DOM the
// component owns is the textarea's selection glue (reading it on toolbar
// clicks, applying `editorSelection` after the container transforms the
// draft); the transformations themselves are pure domain helpers.
import { useEffect, useRef } from 'react'
import {
  Bold,
  Check,
  ChevronLeft,
  CircleAlert,
  Code,
  ExternalLink,
  FileText,
  FileX,
  Hourglass,
  Italic,
  Link,
  List,
  type LucideIcon,
  Pencil,
  RefreshCw,
  SearchX,
  Strikethrough
} from 'lucide-react'
import type { Attachment } from '../../../shared/ipc/adjuntos'
import { cn } from '../../shared/lib/cn'
import { focusRing, interactive, interactiveChip, interactiveGhost } from '../../shared/lib/interactive'
import {
  formatViewerMeta,
  getFileExtension,
  indexBadgeFor,
  type IndexBadgeIcon,
  type ViewerMode
} from '../domain/attachmentDisplay'
import { parseMarkdown } from '../domain/markdown'
import { countLines, type ToolbarAction } from '../domain/markdownEditing'
import { MarkdownView } from './MarkdownView'

// Same icon-name → component convention as `AttachmentRow.tsx` — the domain
// layer stays framework-free and returns only the identifier.
const INDEX_BADGE_ICON_COMPONENTS: Record<IndexBadgeIcon, LucideIcon> = {
  check: Check,
  hourglass: Hourglass,
  'search-x': SearchX
}

// The six toolbar buttons, in the approved design's order.
const TOOLBAR_BUTTONS: Array<{ action: ToolbarAction; label: string; Icon: LucideIcon }> = [
  { action: 'bold', label: 'Negrita', Icon: Bold },
  { action: 'italic', label: 'Cursiva', Icon: Italic },
  { action: 'strikethrough', label: 'Tachado', Icon: Strikethrough },
  { action: 'list', label: 'Lista', Icon: List },
  { action: 'code', label: 'Código', Icon: Code },
  { action: 'link', label: 'Enlace', Icon: Link }
]

export interface AttachmentViewerProps {
  attachment: Attachment
  subjectName: string
  mode: ViewerMode
  /** The saved document content — undefined while loading or failed. */
  content: string | undefined
  /** The editor's working copy ('' when no edit session is open). */
  draft: string
  dirty: boolean
  isLoading: boolean
  isError: boolean
  /** True when the read failed with ATTACHMENT_FILE_MISSING specifically. */
  isMissing: boolean
  /**
   * Selection the container wants applied to the textarea after a toolbar
   * transformation — the component's only piece of DOM glue.
   */
  editorSelection: { start: number; end: number } | null
  onBack: () => void
  onModeChange: (mode: ViewerMode) => void
  onDraftChange: (draft: string) => void
  onSave: () => void
  onCancel: () => void
  onOpenExternal: () => void
  onToolbarAction: (action: ToolbarAction, selection: { start: number; end: number }) => void
}

function SkeletonLine({ widthClass }: { widthClass: string }): React.JSX.Element {
  return <span data-testid="visor-skeleton-line" className={cn('h-3 rounded-full bg-muted', widthClass)} aria-hidden />
}

export function AttachmentViewer({
  attachment,
  subjectName,
  mode,
  content,
  draft,
  dirty,
  isLoading,
  isError,
  isMissing,
  editorSelection,
  onBack,
  onModeChange,
  onDraftChange,
  onSave,
  onCancel,
  onOpenExternal,
  onToolbarAction
}: AttachmentViewerProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Applies the container's post-transformation selection once the new draft
  // has rendered — effects run after the commit, so the value is in place.
  useEffect(() => {
    if (editorSelection !== null && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(editorSelection.start, editorSelection.end)
    }
  }, [editorSelection])

  const extension = getFileExtension(attachment.fileName) || '—'
  const badge = indexBadgeFor(attachment.indexStatus)
  const BadgeIcon = INDEX_BADGE_ICON_COMPONENTS[badge.icon]
  const lineCount = countLines(draft)

  function handleToolbarClick(action: ToolbarAction): void {
    const editor = textareaRef.current
    onToolbarAction(action, {
      start: editor?.selectionStart ?? 0,
      end: editor?.selectionEnd ?? 0
    })
  }

  return (
    <section aria-label={`Documento ${attachment.fileName}`} className="flex h-full min-h-0 flex-col gap-4">
      {/* Back link (design: chevron 14px + subject name, 12px/500 muted). */}
      <button
        type="button"
        onClick={onBack}
        className={cn(
          'flex w-fit items-center gap-1.5 text-body-sm font-medium text-muted-foreground',
          interactiveGhost
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {subjectName}
      </button>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* Type chip (design: surface-sunken, radius 6, padding 4x8,
                file-text 12px + extension 10px/600 tracking 0.5 muted). */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1">
              <FileText className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span className="text-micro font-semibold tracking-[0.5px] text-muted-foreground uppercase">
                {extension}
              </span>
            </span>
            <h2 className="truncate font-display text-heading font-semibold text-foreground">{attachment.fileName}</h2>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-body-sm text-secondary-foreground">
              {formatViewerMeta(attachment.sizeBytes, attachment.createdAt, mode)}
            </span>
            {mode === 'vista' ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-[5px] rounded-md px-2 py-1 text-caption font-semibold',
                  badge.classes
                )}
              >
                <BadgeIcon className="h-3 w-3" aria-hidden="true" />
                {badge.label}
              </span>
            ) : (
              dirty && (
                <span className="inline-flex shrink-0 items-center gap-[5px] rounded-md bg-warn-soft px-2 py-1 text-micro font-semibold text-warn">
                  <Pencil className="h-[11px] w-[11px]" aria-hidden="true" />
                  Sin guardar
                </span>
              )
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Segmented Vista/Edición toggle (design: container surface-sunken
              radius 8 padding 2 gap 2; active segment surface + border). */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(['vista', 'edicion'] as const).map((segment) => {
              const isActive = mode === segment
              return (
                <button
                  key={segment}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onModeChange(segment)}
                  className={cn(
                    'rounded-md border px-3 py-[5px] text-body-sm',
                    isActive
                      ? 'border-border bg-card font-semibold text-foreground'
                      : 'border-transparent font-medium text-secondary-foreground',
                    interactiveChip
                  )}
                >
                  {segment === 'vista' ? 'Vista' : 'Edición'}
                </button>
              )
            })}
          </div>

          {mode === 'vista' ? (
            <button
              type="button"
              aria-label="Abrir con la aplicación del sistema"
              onClick={onOpenExternal}
              className={cn(
                'flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-muted text-muted-foreground',
                interactiveGhost
              )}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  'rounded-lg bg-secondary px-3 py-1.5 text-body-sm font-medium text-secondary-foreground',
                  interactive,
                  'hover:bg-secondary/80 active:bg-secondary/70'
                )}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-body-sm font-semibold text-primary-foreground',
                  interactive,
                  'hover:bg-primary/90 active:bg-primary/80'
                )}
              >
                <Check className="h-[13px] w-[13px]" aria-hidden />
                Guardar
              </button>
            </>
          )}
        </div>
      </header>

      {/* Document card (design: fill remaining height, radius 12, clip). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {mode === 'vista' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-10">
            <div className="mx-auto max-w-[720px] py-7">
              {isError || isMissing ? (
                <div className="flex items-center gap-3">
                  {isMissing ? (
                    <FileX className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <p className="text-body font-semibold text-foreground">
                    {isMissing ? 'No se encontró el archivo en disco' : 'No se pudo cargar el documento'}
                  </p>
                </div>
              ) : isLoading || content === undefined ? (
                <div className="flex flex-col gap-3">
                  <SkeletonLine widthClass="h-5 w-2/3" />
                  <SkeletonLine widthClass="w-full" />
                  <SkeletonLine widthClass="w-5/6" />
                  <SkeletonLine widthClass="w-3/4" />
                </div>
              ) : (
                <MarkdownView blocks={parseMarkdown(content)} />
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-border px-3 py-2">
              {TOOLBAR_BUTTONS.map(({ action, label, Icon }) => (
                <button
                  key={action}
                  type="button"
                  aria-label={label}
                  onClick={() => handleToolbarClick(action)}
                  className={cn(
                    'flex h-[26px] w-[26px] items-center justify-center rounded-md text-secondary-foreground',
                    interactiveGhost
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 px-6 py-5">
              <textarea
                ref={textareaRef}
                aria-label="Editor de markdown"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                spellCheck={false}
                className={cn(
                  'h-full w-full resize-none bg-transparent font-mono text-body-sm leading-[1.8] text-foreground',
                  focusRing
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
                Al guardar, el adjunto se vuelve a indexar para Preguntar
              </span>
              <span className="shrink-0 text-caption text-muted-foreground">
                Markdown · {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
