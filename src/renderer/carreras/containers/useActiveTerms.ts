// Feeds the sidebar's brand block everything the user is cursando today.
//
// It reuses the `['carreras']` query the Carreras screen already owns, so the
// sidebar costs no extra IPC round-trip and — more importantly — refreshes on
// the SAME invalidation. Renaming a período or moving its dates updates the
// sidebar in the same tick as the table it was edited in.
import { useQuery } from '@tanstack/react-query'
import { carrerasApi } from '../adapters/carrerasApi'
import { listActiveTerms, type ActiveTerm } from '../domain/activeTerms'

const NONE: ActiveTerm[] = []

/** `now` is injectable for the same reason every container here takes it: a clock read inside is untestable. */
export function useActiveTerms(now: Date = new Date()): ActiveTerm[] {
  const { data } = useQuery({
    queryKey: ['carreras'],
    queryFn: () => carrerasApi.list()
  })

  // Loading and "nothing is running" render the same way on purpose: a
  // spinner in a 13px sidebar line would be more noise than the answer is
  // worth. A shared constant keeps the empty case referentially stable.
  return data ? listActiveTerms(data, now) : NONE
}
