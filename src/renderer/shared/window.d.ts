// Ambient type for the preload-exposed bridge (design §2: "one typed `api`
// object per domain"). Renderer and preload are separate TS programs
// (tsconfig.web.json vs tsconfig.node.json), so this mirrors preload's
// `Api` shape by hand rather than importing it directly.
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  Attachment,
  DeleteAttachmentResult,
  ReadAttachmentTextResult
} from '../../shared/ipc/adjuntos'
import type { ExportJsonResult, OpenExternalInput } from '../../shared/ipc/app'
import type {
  AskQuestionInput,
  AskTurnResponse,
  ConversationSummary,
  DeleteConversationInput,
  DeleteConversationResult,
  GetConversationInput,
  GetConversationResult
} from '../../shared/ipc/ask'
import type {
  CliPreference,
  CliProviderStatus,
  DisconnectCliInput,
  DiscoveredModel,
  ProbeCliInput,
  SetCliOverrideInput
} from '../../shared/ipc/cli'
import type {
  ClassDayInput,
  ClassDayResult,
  SaveClassNoteInput,
  SaveClassNoteResult,
  SetAttendanceInput
} from '../../shared/ipc/clases'
import type {
  CreatePeriodInput,
  CreateProgramInput,
  DeletePeriodResult,
  DeleteProgramResult,
  PeriodRecord,
  ProgramRecord,
  ProgramWithPeriods,
  UpdatePeriodInput,
  UpdateProgramInput
} from '../../shared/ipc/carreras'
import type {
  CreateDeadlineInput,
  DeadlineWithSubject,
  DeleteDeadlineResult,
  SetDeadlineDoneInput,
  UpdateDeadlineInput
} from '../../shared/ipc/entregas'
import type {
  AcademicDateRecord,
  AcademicDateWithProgram,
  CreateAcademicDateInput,
  DeleteAcademicDateResult,
  UpdateAcademicDateInput
} from '../../shared/ipc/fechas'
import type { CreateFinalExamInput, DeleteFinalExamResult, UpdateFinalExamInput } from '../../shared/ipc/finales'
import type {
  CreatePartialExamInput,
  DeletePartialExamResult,
  UpdatePartialExamInput
} from '../../shared/ipc/parciales'
import type {
  AddPrerequisiteInput,
  DeletePrerequisiteResult,
  PlannerEntryInput,
  PlannerEntryRecord,
  UpdatePrerequisiteInput
} from '../../shared/ipc/planificador'
import type { WeekScheduleResult } from '../../shared/ipc/horario'
import type { DashboardResult } from '../../shared/ipc/hoy'
import type { IndexStatusChangedPayload, SyncResult } from '../../shared/ipc/indexado'
import type {
  AttendanceRecord,
  CreateSubjectInput,
  DeleteSubjectResult,
  FinalExamRecord,
  IpcResult,
  PartialExamRecord,
  SetSubjectOutcomeInput,
  SubjectDetailResult,
  SubjectPrerequisite,
  SubjectWithSlots,
  SubjectWithStatus,
  UpdateSubjectScheduleInput
} from '../../shared/ipc/materias'
import type { SetThemePreferenceInput, ThemePreference } from '../../shared/ipc/theme'

declare global {
  interface Window {
    api: {
      materias: {
        create: (input: CreateSubjectInput) => Promise<IpcResult<SubjectWithSlots>>
        list: () => Promise<IpcResult<SubjectWithStatus[]>>
        detail: (id: number) => Promise<IpcResult<SubjectDetailResult>>
        updateSchedule: (input: UpdateSubjectScheduleInput) => Promise<IpcResult<SubjectWithSlots>>
        delete: (id: number) => Promise<IpcResult<DeleteSubjectResult>>
        setOutcome: (input: SetSubjectOutcomeInput) => Promise<IpcResult<SubjectWithStatus>>
      }
      carreras: {
        create: (input: CreateProgramInput) => Promise<IpcResult<ProgramRecord>>
        list: () => Promise<IpcResult<ProgramWithPeriods[]>>
        detail: (id: number) => Promise<IpcResult<ProgramWithPeriods>>
        update: (input: UpdateProgramInput) => Promise<IpcResult<ProgramRecord>>
        createPeriod: (input: CreatePeriodInput) => Promise<IpcResult<PeriodRecord>>
        updatePeriod: (input: UpdatePeriodInput) => Promise<IpcResult<PeriodRecord>>
        deletePeriod: (id: number) => Promise<IpcResult<DeletePeriodResult>>
        delete: (id: number) => Promise<IpcResult<DeleteProgramResult>>
      }
      fechas: {
        /** Every carrera's administrative dates, flat and unfiltered — grouping is a rendering-time question. */
        list: () => Promise<IpcResult<AcademicDateWithProgram[]>>
        create: (input: CreateAcademicDateInput) => Promise<IpcResult<AcademicDateRecord>>
        update: (input: UpdateAcademicDateInput) => Promise<IpcResult<AcademicDateRecord>>
        delete: (id: number) => Promise<IpcResult<DeleteAcademicDateResult>>
      }
      finales: {
        create: (input: CreateFinalExamInput) => Promise<IpcResult<FinalExamRecord>>
        update: (input: UpdateFinalExamInput) => Promise<IpcResult<FinalExamRecord>>
        delete: (id: number) => Promise<IpcResult<DeleteFinalExamResult>>
      }
      parciales: {
        create: (input: CreatePartialExamInput) => Promise<IpcResult<PartialExamRecord>>
        update: (input: UpdatePartialExamInput) => Promise<IpcResult<PartialExamRecord>>
        delete: (id: number) => Promise<IpcResult<DeletePartialExamResult>>
      }
      clases: {
        /** Records or corrects one class's mark. Upsert — one mark per `(subjectId, date)`. */
        setAttendance: (input: SetAttendanceInput) => Promise<IpcResult<AttendanceRecord>>
        /** Back to unmarked. Succeeds even if the class was never marked. */
        clearAttendance: (input: ClassDayInput) => Promise<IpcResult<ClassDayResult>>
        /** Writes or rewrites one class's apunte. Upsert — one apunte per `(subjectId, date)`. */
        saveNote: (input: SaveClassNoteInput) => Promise<IpcResult<SaveClassNoteResult>>
        /** Removes the apunte. Succeeds even if the class had none. */
        deleteNote: (input: ClassDayInput) => Promise<IpcResult<ClassDayResult>>
      }
      planificador: {
        /** Every draft line, across every período — filtering is the screen's job. */
        list: () => Promise<IpcResult<PlannerEntryRecord[]>>
        /** Records the correlativa, or corrects its level if the pair already had one. */
        addPrerequisite: (input: AddPrerequisiteInput) => Promise<IpcResult<SubjectPrerequisite>>
        /** Changes only the level — re-pointing an edge is a remove plus an add. */
        updatePrerequisite: (input: UpdatePrerequisiteInput) => Promise<IpcResult<SubjectPrerequisite>>
        removePrerequisite: (id: number) => Promise<IpcResult<DeletePrerequisiteResult>>
        /** Puts the materia in that período's draft. Idempotent, and never gated on eligibility. */
        addEntry: (input: PlannerEntryInput) => Promise<IpcResult<PlannerEntryRecord>>
        /** Takes it back out. Succeeds even if it was not in the draft. */
        removeEntry: (input: PlannerEntryInput) => Promise<IpcResult<PlannerEntryInput>>
      }
      horario: {
        week: () => Promise<IpcResult<WeekScheduleResult>>
      }
      hoy: {
        dashboard: () => Promise<IpcResult<DashboardResult>>
      }
      entregas: {
        create: (input: CreateDeadlineInput) => Promise<IpcResult<DeadlineWithSubject>>
        list: () => Promise<IpcResult<DeadlineWithSubject[]>>
        update: (input: UpdateDeadlineInput) => Promise<IpcResult<DeadlineWithSubject>>
        setDone: (input: SetDeadlineDoneInput) => Promise<IpcResult<DeadlineWithSubject>>
        delete: (id: number) => Promise<IpcResult<DeleteDeadlineResult>>
      }
      adjuntos: {
        list: (subjectId: number) => Promise<IpcResult<Attachment[]>>
        add: (input: AddAttachmentsInput) => Promise<IpcResult<AddAttachmentsResult>>
        open: (id: number) => Promise<IpcResult<undefined>>
        remove: (id: number) => Promise<IpcResult<DeleteAttachmentResult>>
        /** Markdown viewer read: `.md` only, ≤ 1 MiB, content as a STRING — never a path. */
        read: (id: number) => Promise<IpcResult<ReadAttachmentTextResult>>
        /** Markdown editor save: rewrites the stored file and returns the updated row. */
        write: (id: number, content: string) => Promise<IpcResult<Attachment>>
      }
      indexado: {
        sync: () => Promise<IpcResult<SyncResult>>
        /** Pushed whenever a background indexing job finishes. Returns an unsubscribe function. */
        onStatusChanged: (callback: (payload: IndexStatusChangedPayload) => void) => () => void
      }
      theme: {
        /** The persisted preference — `system` for a profile that never chose. */
        getPreference: () => Promise<IpcResult<ThemePreference>>
        /** Applies `nativeTheme.themeSource` AND persists in one round trip, echoing the persisted value. */
        setPreference: (input: SetThemePreferenceInput) => Promise<IpcResult<ThemePreference>>
      }
      app: {
        openExternal: (input: OpenExternalInput) => Promise<IpcResult<undefined>>
        exportJson: () => Promise<IpcResult<ExportJsonResult>>
        onExportRequested: (callback: () => void) => () => void
      }
      cli: {
        /** Probes ONE CLI, on demand. There is no bulk variant on purpose — connecting a CLI is an explicit act. */
        probe: (input: ProbeCliInput) => Promise<IpcResult<CliProviderStatus>>
        /** Re-probes only the provider whose override changed. */
        setOverride: (input: SetCliOverrideInput) => Promise<IpcResult<CliProviderStatus>>
        /** What the app persisted per CLI: the opt-in and the saved path. A settings read — it starts no process. */
        preferences: () => Promise<IpcResult<CliPreference[]>>
        /** Withdraws the opt-in. Leaves any manual path override in place. */
        disconnect: (input: DisconnectCliInput) => Promise<IpcResult<undefined>>
        /** Models read out of the installed CLI's own state. Never errors — an empty list means nothing was discovered. */
        models: () => Promise<IpcResult<DiscoveredModel[]>>
      }
      ask: {
        question: (input: AskQuestionInput) => Promise<IpcResult<AskTurnResponse>>
        cancel: () => Promise<IpcResult<undefined>>
        listConversations: () => Promise<IpcResult<ConversationSummary[]>>
        getConversation: (input: GetConversationInput) => Promise<IpcResult<GetConversationResult>>
        deleteConversation: (input: DeleteConversationInput) => Promise<IpcResult<DeleteConversationResult>>
      }
    }
  }
}

export {}
