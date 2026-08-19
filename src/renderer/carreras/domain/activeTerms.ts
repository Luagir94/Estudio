// What the user is cursando right now — the sidebar's brand block (design
// node `y0BCKe`).
//
// This returns a LIST, and that is the whole design of it. The app has no
// concept of an active carrera: there can be several, and which one you care
// about at any moment is yours to decide, not the app's to guess. An earlier
// version picked a single winner across all carreras with the período
// picker's tie-break, which read fine with one carrera and quietly erased the
// other two as soon as there were three.
//
// Note this deliberately does NOT reuse `pickDefaultPeriodId`. That function
// picks ONE because a form field has to be pre-filled with one; this one
// reports what is true. The two answer different questions, and making them
// share an implementation is what produced the wrong answer here.
import { periodStatus } from './period'
import type { ProgramWithPeriods } from '../../../shared/ipc/carreras'

export interface ActiveTerm {
  programName: string
  periodName: string
}

/** Every período covering `today`, across every carrera, in document order. */
export function listActiveTerms(programs: ProgramWithPeriods[], today: Date): ActiveTerm[] {
  return programs.flatMap((program) =>
    program.periods
      .filter((period) => periodStatus(period, today) === 'activo')
      .map((period) => ({ programName: program.name, periodName: period.name }))
  )
}
