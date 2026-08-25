// Presentational, READ-ONLY: the condición de cursada the cátedra granted,
// as it sits in the subject header's meta row.
//
// There is no editing affordance here and none anywhere else yet: this badge
// REPORTS a stored value (`subjects.regularity`), it never computes one. The
// app cannot compute one — every cátedra writes its own promoción and
// regularidad rules — so recording the faculty's verdict is the student's
// act, not a consequence of any parcial.
//
// An undeclared condición renders NOTHING: no "sin definir" chip, no
// placeholder. A condición that has not been granted is not a condición, and
// a chip saying so would be the header inventing a state the acta has not
// reached.
import { useTranslation } from 'react-i18next'
import type { SubjectRegularity } from '../../../shared/ipc/materias'
import { DotBadge, type DotBadgeTone } from '../../shared/components/ui/dot-badge'

interface RegularityBadgeProps {
  /** `null` = not declared yet — renders nothing at all. */
  regularity: SubjectRegularity | null
}

const TONES: Record<SubjectRegularity, DotBadgeTone> = {
  regular: 'ok',
  // Violet is reserved for interaction everywhere else — promoción is the
  // one state the approved design spends it on.
  promocionada: 'accent',
  libre: 'urgent'
}

export function RegularityBadge({ regularity }: RegularityBadgeProps): React.JSX.Element | null {
  const { t } = useTranslation('materias')
  if (regularity === null) {
    return null
  }
  return <DotBadge tone={TONES[regularity]}>{t(`subjectDetail.regularity.${regularity}`)}</DotBadge>
}
