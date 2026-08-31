// Presentational (design node `GsoRX` — "Overflow Menu", verified via the
// Pencil MCP tools): the subject detail header's `⋯`.
//
// "Editar materia" used to sit in the header as a full outline button beside
// "Cerrar materia", and "Eliminar materia" was buried in the edit modal's
// footer — a destructive action reachable only by opening a form you did not
// come to fill in. Both live here now: editing is occasional, deleting is
// rare, and neither should out-shout the one action the header is FOR.
//
// Deleting is SECOND on purpose: the first item in a menu is the one a fast
// hand lands on, and that is the wrong place for the irreversible one.
import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ActionMenu } from '../../shared/components/ui/action-menu'

interface SubjectActionsMenuProps {
  onEdit: () => void
  onDelete: () => void
}

export function SubjectActionsMenu({ onEdit, onDelete }: SubjectActionsMenuProps): React.JSX.Element {
  const { t } = useTranslation('materias')

  return (
    <ActionMenu
      label={t('subjectDetail.moreActions')}
      // Card surface on the border — `outline` is transparent by design, and
      // this one sits on the page ground, not on a card.
      triggerVariant="outline"
      triggerSize="compactIcon"
      triggerClassName="bg-card text-secondary-foreground"
      trigger={<Ellipsis className="h-3.5 w-3.5" aria-hidden="true" />}
      items={[
        { id: 'edit', label: t('subjectDetail.editSubject'), icon: Pencil, onSelect: onEdit },
        {
          id: 'delete',
          label: t('subjectDetail.deleteSubject'),
          icon: Trash2,
          tone: 'destructive',
          onSelect: onDelete
        }
      ]}
    />
  )
}
