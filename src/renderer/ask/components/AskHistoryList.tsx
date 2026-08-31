// Presentational (design #268 §3, node `OL3Gy` "History List" on `Screen —
// Preguntar · Historial`, verified via the Pencil MCP tools): the "+
// Conversación nueva" action plus one row per conversation, exactly one of
// which (the active thread) carries the `$surface-sunken` selected fill. No
// data fetching, no IPC — that lives in `AskPanelContainer`.
//
// The static mockup does not draw a delete affordance on the row (design
// #268's own disclosed gap). This reuses the icon-button pattern
// `DeadlineRow`/`AttachmentRow` already ship (`Trash2` +
// `interactiveGhostDestructive`) rather than inventing a new one.
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConversationSummary } from '../../../shared/ipc/ask'
import { cn } from '../../shared/lib/cn'
import { interactiveChip, interactiveGhostDestructive, interactiveSurface } from '../../shared/lib/interactive'
import { ASK_NEW_CONVERSATION_LABEL } from '../domain/askDisplay'
import { formatConversationDate } from '../domain/conversationDate'

interface AskHistoryListProps {
  conversations: readonly ConversationSummary[]
  activeId: number | null
  /** Reference instant for the relative dates. Defaults to the real clock. */
  now?: Date
  onSelect: (id: number) => void
  onNewConversation: () => void
  onDelete: (id: number) => void
}

export function AskHistoryList({
  conversations,
  activeId,
  now = new Date(),
  onSelect,
  onNewConversation,
  onDelete
}: AskHistoryListProps): React.JSX.Element {
  const { t } = useTranslation('ask')
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onNewConversation}
        className={cn('flex w-full flex-col gap-1 rounded-lg px-2.5 py-2.5 text-left', interactiveSurface)}
      >
        <span className="text-body font-semibold tracking-[-0.1px] text-primary-ink">{ASK_NEW_CONVERSATION_LABEL}</span>
      </button>

      {conversations.map((conversation) => {
        const selected = conversation.id === activeId
        return (
          <div
            key={conversation.id}
            data-selected={selected}
            className={cn(
              'flex w-full items-center gap-1 rounded-lg px-2.5 py-2',
              selected ? 'bg-secondary' : '',
              interactiveChip
            )}
          >
            {/* `aria-pressed` rides HERE, not on the row. The row is a plain
                `div` carrying the selected fill, so on its own it says
                "which thread is open?" in colour and nothing else — and the
                one control that answers that question is the one that
                switches threads. `data-selected` stays on the row: it drives
                the fill across the whole box, delete button included. */}
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(conversation.id)}
              className="flex min-w-0 flex-1 flex-col gap-1 text-left"
            >
              <span className="truncate text-body font-semibold tracking-[-0.1px] text-foreground">
                {conversation.title}
              </span>
              <span className="text-caption text-muted-foreground">
                {formatConversationDate(conversation.updatedAt, now)}
              </span>
            </button>
            <button
              type="button"
              aria-label={t('askHistoryList.deleteConversation', { title: conversation.title })}
              onClick={() => onDelete(conversation.id)}
              className={cn('shrink-0 rounded-md p-1.5 text-muted-foreground', interactiveGhostDestructive)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
