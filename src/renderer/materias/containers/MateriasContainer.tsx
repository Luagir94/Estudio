// Owns list<->detail navigation state for the materias domain. TanStack
// Router + memoryHistory (design §4) is still deferred — slice 2a's
// deviation log already established this precedent ("Routing is deferred
// to whichever slice first needs to navigate between two screens"); this is
// that slice, and local state satisfies "click a subject -> see its
// detail" without a router. Revisit once a second domain needs deep-linked
// navigation.
import { useState } from 'react'
import { MateriasListContainer } from './MateriasListContainer'
import { SubjectDetailContainer } from './SubjectDetailContainer'

interface MateriasContainerProps {
  /**
   * Subject to open on mount, handed over by App when the user asked for it
   * from another screen (Carreras). Read ONCE, as the initial state: from
   * there on the navigation is this container's own, and `onBack` must be
   * able to leave the detail without App overriding it.
   */
  initialSubjectId?: number | null
  /** Navigates to Carreras — threaded down to the "no periods yet" dead end. */
  onGoToCarreras?: () => void
}

export function MateriasContainer({
  initialSubjectId = null,
  onGoToCarreras
}: MateriasContainerProps = {}): React.JSX.Element {
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(initialSubjectId)

  if (selectedSubjectId !== null) {
    return <SubjectDetailContainer subjectId={selectedSubjectId} onBack={() => setSelectedSubjectId(null)} />
  }

  return <MateriasListContainer onSelectSubject={setSelectedSubjectId} onGoToCarreras={onGoToCarreras} />
}
