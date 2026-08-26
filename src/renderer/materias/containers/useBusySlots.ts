// Feeds every schedule form the hours that are already taken, so a clashing
// class is caught while it is being loaded rather than discovered later on
// the weekly grid.
//
// It reuses the `['materias']` query the list/detail/Horario screens already
// own, so the warning costs no extra IPC round-trip and — more importantly —
// refreshes on the SAME invalidation: saving a schedule updates what the
// next form warns about in the same tick.
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { BusySpan } from '../../shared/domain/slotOverlap'
import { materiasApi } from '../adapters/materiasApi'
import { collectBusySlots } from '../domain/busySlots'

const NONE: BusySpan[] = []

/**
 * `excludeSubjectId` is the subject whose form is open (null when creating
 * one). `now` is injectable for the same reason every container here takes
 * it: a clock read inside is untestable.
 *
 * Fails OPEN, like the Horario grid's own filter: while the query is loading
 * or after it failed, no hour is reported as busy. A missing warning is a
 * far smaller harm than a warning about an hour that is actually free.
 */
export function useBusySlots(excludeSubjectId: number | null = null, now: Date = new Date()): BusySpan[] {
  const { data } = useQuery({
    queryKey: ['materias'],
    queryFn: materiasApi.list
  })

  return useMemo(() => (data ? collectBusySlots(data, { now, excludeSubjectId }) : NONE), [data, now, excludeSubjectId])
}
