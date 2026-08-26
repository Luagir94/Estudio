// Presentational (approved `.pen`): the CORRELATIVAS card in the subject
// detail's RIGHT column, immediately after the Cátedra card and molded on it —
// same surface, radius, 1px border and padding.
//
// It lives in the planificador slice rather than in materias even though it is
// drawn on a materias screen, because the rule it renders is this feature's:
// `satisfiesLevel` is the SAME function the Planificador's habilitada/bloqueada
// verdicts come from, so a materia can never read "Cumplida" here and block a
// draft two screens away.
//
// THE REQUIRED LEVEL AND WHETHER YOU MEET IT ARE TWO SEPARATE FACTS, and the
// card keeps them separate on purpose: the second line says what the plan de
// estudios demands, the badge says where you stand. Collapsing them into one
// chip reading "Aprobada" would leave the student unable to tell a requirement
// from an achievement.
import { useTranslation } from 'react-i18next'
import type { SubjectPrerequisite } from '../../../shared/ipc/materias'
import { DotBadge } from '../../shared/components/ui/dot-badge'
import { satisfiesLevel } from '../domain/requirements'

interface CorrelativasCardProps {
  prerequisites: SubjectPrerequisite[]
}

export function CorrelativasCard({ prerequisites }: CorrelativasCardProps): React.JSX.Element | null {
  const { t } = useTranslation('materias')

  // Hidden, not empty-stated. A materia with no correlativas has nothing to
  // say, and a heading over a blank would be one more card in a column that is
  // already six tall.
  if (prerequisites.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-overline font-semibold text-muted-foreground">{t('correlativas.heading')}</span>
      {prerequisites.map((prerequisite) => {
        const met = satisfiesLevel(prerequisite.requires, prerequisite.requiredLevel)
        return (
          <div key={prerequisite.id} data-testid="correlativa-row" className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-body-sm font-semibold text-foreground">{prerequisite.requires.name}</span>
              <span className="text-caption text-muted-foreground">
                {prerequisite.requiredLevel === 'aprobada'
                  ? t('correlativas.requiresAprobada')
                  : t('correlativas.requiresRegularizada')}
              </span>
            </div>
            <DotBadge tone={met ? 'ok' : 'urgent'}>{met ? t('correlativas.met') : t('correlativas.unmet')}</DotBadge>
          </div>
        )
      })}
    </div>
  )
}
