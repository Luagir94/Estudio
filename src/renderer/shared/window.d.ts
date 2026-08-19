// Ambient type for the preload-exposed bridge (design §2: "one typed `api`
// object per domain"). Renderer and preload are separate TS programs
// (tsconfig.web.json vs tsconfig.node.json), so this mirrors preload's
// `Api` shape by hand rather than importing it directly.
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  Attachment,
  DeleteAttachmentResult
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
import type { CliProviderStatus, DiscoveredModel, SetCliOverrideInput } from '../../shared/ipc/cli'
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
import type { CreateFinalExamInput, DeleteFinalExamResult, UpdateFinalExamInput } from '../../shared/ipc/finales'
import type { WeekScheduleResult } from '../../shared/ipc/horario'
import type { DashboardResult } from '../../shared/ipc/hoy'
import type {
  CreateSubjectInput,
  DeleteSubjectResult,
  FinalExamRecord,
  IpcResult,
  SetSubjectOutcomeInput,
  SubjectDetailResult,
  SubjectWithSlots,
  SubjectWithStatus,
  UpdateSubjectScheduleInput
} from '../../shared/ipc/materias'

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
      finales: {
        create: (input: CreateFinalExamInput) => Promise<IpcResult<FinalExamRecord>>
        update: (input: UpdateFinalExamInput) => Promise<IpcResult<FinalExamRecord>>
        delete: (id: number) => Promise<IpcResult<DeleteFinalExamResult>>
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
      }
      app: {
        openExternal: (input: OpenExternalInput) => Promise<IpcResult<undefined>>
        exportJson: () => Promise<IpcResult<ExportJsonResult>>
        onExportRequested: (callback: () => void) => () => void
      }
      cli: {
        /** One status per supported provider, in menu order. */
        status: () => Promise<IpcResult<CliProviderStatus[]>>
        /** Re-probes only the provider whose override changed. */
        setOverride: (input: SetCliOverrideInput) => Promise<IpcResult<CliProviderStatus>>
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
