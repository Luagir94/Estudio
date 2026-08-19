// Owns list -> carrera -> período navigation for the carreras domain. Local
// state rather than a router, same precedent (and same open question) as
// MateriasContainer: TanStack Router lands when deep-linked navigation is
// actually needed.
//
// The período is stored as its own id ALONGSIDE the program id, not instead
// of it: the period screen needs its carrera for the header, the back link
// and the edit form, and going back has to land on the carrera you came
// from rather than on the list.
import { useState } from 'react'
import { CarreraDetailContainer } from './CarreraDetailContainer'
import { CarrerasContainer } from './CarrerasContainer'
import { PeriodDetailContainer } from './PeriodDetailContainer'

interface CarrerasScreenContainerProps {
  /** Passed through to the details: opening a subject leaves this screen. */
  onOpenSubject?: (id: number) => void
}

export function CarrerasScreenContainer({ onOpenSubject }: CarrerasScreenContainerProps = {}): React.JSX.Element {
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

  // Leaving a carrera drops the period with it — otherwise coming back into
  // any carrera would remount straight into a period you opened once, and
  // one that may not even belong to it.
  const handleBackToList = (): void => {
    setSelectedPeriodId(null)
    setSelectedProgramId(null)
  }

  if (selectedProgramId !== null && selectedPeriodId !== null) {
    return (
      <PeriodDetailContainer
        programId={selectedProgramId}
        periodId={selectedPeriodId}
        onBack={() => setSelectedPeriodId(null)}
        onOpenSubject={onOpenSubject}
      />
    )
  }

  if (selectedProgramId !== null) {
    return (
      <CarreraDetailContainer
        programId={selectedProgramId}
        onBack={handleBackToList}
        onSelectPeriod={setSelectedPeriodId}
        onOpenSubject={onOpenSubject}
      />
    )
  }

  return <CarrerasContainer onSelectProgram={setSelectedProgramId} />
}
