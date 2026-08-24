// Presentational (design §4, node `exPVC`): the stack of program cards.
import { useTranslation } from 'react-i18next'
import { ProgramCard } from './ProgramCard'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'

interface CarrerasListProps {
  programs: ProgramWithPeriods[]
  now: Date
  onSelect?: (id: number) => void
}

export function CarrerasList({ programs, now, onSelect }: CarrerasListProps): React.JSX.Element {
  const { t } = useTranslation('carreras')
  if (programs.length === 0) {
    return <p className="text-body-lg text-muted-foreground">{t('carrerasList.empty')}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {programs.map((program) => (
        <ProgramCard key={program.id} program={program} now={now} onSelect={onSelect} />
      ))}
    </ul>
  )
}
