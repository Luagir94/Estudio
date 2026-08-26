// Presentational (approved design): the onboarding empty state for a
// zero-subject account. Distinct from MateriasList's filtered-empty line —
// this renders only when NOTHING is loaded, so it teaches the two ways in:
// create the first materia directly, or set up carrera + período first.
// Navigation and the modal flow stay with the container, same split as the
// rest of the domain.
import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/ui/button'

interface MateriasEmptyStateProps {
  /** Opens the existing NuevaMateriaModal flow. */
  onAddSubject: () => void
  /** Navigates to the Carreras screen. */
  onGoToCarreras: () => void
}

export function MateriasEmptyState({ onAddSubject, onGoToCarreras }: MateriasEmptyStateProps): React.JSX.Element {
  const { t } = useTranslation('materias')

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center">
      {/* 56px circle — one step up from the other empty states' 48px: this is
          the app's front door, not a corner of a populated screen. */}
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
        <GraduationCap className="h-6 w-6 text-primary-ink" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-title font-semibold text-foreground">{t('materiasEmptyState.title')}</p>
        <p className="max-w-[440px] text-body text-secondary-foreground">{t('materiasEmptyState.subtitle')}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onAddSubject}>
          {t('materiasEmptyState.addSubject')}
        </Button>
        <Button type="button" variant="outline" onClick={onGoToCarreras}>
          {t('materiasEmptyState.configureProgram')}
        </Button>
      </div>
    </div>
  )
}
