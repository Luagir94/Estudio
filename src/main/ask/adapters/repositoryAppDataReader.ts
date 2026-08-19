import type { AppContext, AppContextFinal } from '../domain/appContext'
import type { AskAppDataPort } from '../askService'

// Reads the app's own rows out of the existing repositories and shapes them
// for the prompt. Deliberately thin: no formatting (that is `appContext.ts`),
// no filtering beyond the privacy line below.
//
// THIS is the file an MCP server replaces. The service depends on
// `AskAppDataPort`, not on any repository, so swapping a live MCP-backed
// implementation in later means writing a sibling of this file and changing
// one line of wiring — nothing in the service, prompt or contract moves.
//
// `contacto` is NOT read. It is usually a professor's phone or email: a third
// party's personal data, unlike everything else here, which is the student's.

/** The slices of the existing repositories this reader needs, named structurally so the real ones satisfy them. */
export interface AppDataSources {
  subjectRepository: {
    list(): readonly {
      id: number
      name: string
      code: string
      docente: string | null
      notas: string | null
      attendanceMinPercent: number | null
      slots: readonly { dayOfWeek: number; startMinutes: number; endMinutes: number; location: string | null }[]
    }[]
  }
  deadlineRepository: {
    list(): readonly { title: string; type: string; dueAt: string; done: boolean; subjectName: string }[]
  }
  finalExamRepository: {
    listBySubject(subjectId: number): readonly { label: string; takenOn: string | null; result: string }[]
  }
  programRepository: {
    list(): readonly { name: string; periods: readonly { name: string; startsOn: string; endsOn: string | null }[] }[]
  }
}

export function createRepositoryAppDataReader({
  subjectRepository,
  deadlineRepository,
  finalExamRepository,
  programRepository
}: AppDataSources): AskAppDataPort {
  return {
    read(): AppContext {
      const subjects = subjectRepository.list()

      // Finals are per-subject in the repository, so this is N small queries
      // rather than one join. N is the number of subjects a student has —
      // dozens at most — and keeping the existing repository contract intact
      // is worth more here than saving those reads.
      const finals: AppContextFinal[] = subjects.flatMap((subject) =>
        finalExamRepository.listBySubject(subject.id).map((final) => ({
          subjectName: subject.name,
          label: final.label,
          takenOn: final.takenOn,
          result: final.result
        }))
      )

      return {
        subjects: subjects.map((subject) => ({
          name: subject.name,
          code: subject.code,
          docente: subject.docente,
          notas: subject.notas,
          attendanceMinPercent: subject.attendanceMinPercent,
          slots: subject.slots
        })),
        deadlines: deadlineRepository.list().map((deadline) => ({
          title: deadline.title,
          type: deadline.type,
          dueAt: deadline.dueAt,
          done: deadline.done,
          subjectName: deadline.subjectName
        })),
        finals,
        periods: programRepository.list().flatMap((program) =>
          program.periods.map((period) => ({
            programName: program.name,
            name: period.name,
            startsOn: period.startsOn,
            endsOn: period.endsOn
          }))
        )
      }
    }
  }
}
