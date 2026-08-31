import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddAttachmentsInput,
  AddAttachmentsResult,
  Attachment,
  CreateMarkdownDocumentInput,
  DeleteAttachmentResult,
  ReadAttachmentTextResult
} from '../shared/ipc/adjuntos'
import type { ExportJsonResult, OpenExternalInput } from '../shared/ipc/app'
import type {
  AskQuestionInput,
  AskTurnResponse,
  ConversationSummary,
  DeleteConversationInput,
  DeleteConversationResult,
  GetConversationInput,
  GetConversationResult
} from '../shared/ipc/ask'
// Imported from the zod-free `channels` module, NOT from `../shared/ipc/app`
// — see channels.ts's doc comment: a runtime (non-`type`) import from a
// zod-importing shared/ipc module breaks the sandboxed preload bundle
// ("module not found: zod"), discovered via the Playwright `_electron`
// smoke test (task 6.8).
import type {
  CliPreference,
  CliProviderStatus,
  DisconnectCliInput,
  DiscoveredModel,
  ProbeCliInput,
  SetCliOverrideInput
} from '../shared/ipc/cli'
import type {
  ClassDayInput,
  ClassDayResult,
  SaveClassNoteInput,
  SaveClassNoteResult,
  SetAttendanceInput
} from '../shared/ipc/clases'
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
} from '../shared/ipc/carreras'
// Both push-event channel constants come from the zod-free `channels`
// module, NOT from `../shared/ipc/app` / `../shared/ipc/indexado` — a
// runtime (non-`type`) import from a zod-importing shared/ipc module breaks
// the sandboxed preload bundle ("module not found: zod").
import {
  ADJUNTOS_CREATE_DOCUMENT_CHANNEL,
  ADJUNTOS_READ_CHANNEL,
  ADJUNTOS_WRITE_CHANNEL,
  INDEXADO_STATUS_CHANGED_CHANNEL,
  MENU_EXPORT_REQUESTED_CHANNEL
} from '../shared/ipc/channels'
import type {
  CreateDeadlineInput,
  DeadlineWithSubject,
  DeleteDeadlineResult,
  SetDeadlineDoneInput,
  UpdateDeadlineInput
} from '../shared/ipc/entregas'
import type {
  AcademicDateRecord,
  AcademicDateWithProgram,
  CreateAcademicDateInput,
  DeleteAcademicDateResult,
  UpdateAcademicDateInput
} from '../shared/ipc/fechas'
import type { CreateFinalExamInput, DeleteFinalExamResult, UpdateFinalExamInput } from '../shared/ipc/finales'
import type { CreatePartialExamInput, DeletePartialExamResult, UpdatePartialExamInput } from '../shared/ipc/parciales'
import type {
  AddPrerequisiteInput,
  DeletePrerequisiteResult,
  PlannerEntryInput,
  PlannerEntryRecord,
  UpdatePrerequisiteInput
} from '../shared/ipc/planificador'
import type { WeekScheduleResult } from '../shared/ipc/horario'
import type { DashboardResult } from '../shared/ipc/hoy'
import type { IndexStatusChangedPayload, SyncResult } from '../shared/ipc/indexado'
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
} from '../shared/ipc/materias'
import type { Palette, SetPaletteInput, SetThemePreferenceInput, ThemePreference } from '../shared/ipc/theme'

// Per-domain command/query bridges are added here as each domain slice
// lands (design §2: "one typed `api` object per domain via
// `contextBridge.exposeInMainWorld`; no raw `ipcRenderer` reaches the
// renderer"). This is a thin forwarder ONLY — it does not parse the
// envelope; the renderer-side adapter Zod-parses the response before
// handing it to TanStack Query (design §2's two-sided parsing rule).
const api = {
  materias: {
    create: (input: CreateSubjectInput): Promise<IpcResult<SubjectWithSlots>> =>
      ipcRenderer.invoke('materias:create', input),
    list: (): Promise<IpcResult<SubjectWithStatus[]>> => ipcRenderer.invoke('materias:list'),
    detail: (id: number): Promise<IpcResult<SubjectDetailResult>> => ipcRenderer.invoke('materias:detail', { id }),
    updateSchedule: (input: UpdateSubjectScheduleInput): Promise<IpcResult<SubjectWithSlots>> =>
      ipcRenderer.invoke('materias:updateSchedule', input),
    delete: (id: number): Promise<IpcResult<DeleteSubjectResult>> => ipcRenderer.invoke('materias:delete', { id }),
    setOutcome: (input: SetSubjectOutcomeInput): Promise<IpcResult<SubjectWithStatus>> =>
      ipcRenderer.invoke('materias:setOutcome', input)
  },
  carreras: {
    create: (input: CreateProgramInput): Promise<IpcResult<ProgramRecord>> =>
      ipcRenderer.invoke('carreras:create', input),
    list: (): Promise<IpcResult<ProgramWithPeriods[]>> => ipcRenderer.invoke('carreras:list'),
    detail: (id: number): Promise<IpcResult<ProgramWithPeriods>> => ipcRenderer.invoke('carreras:detail', { id }),
    update: (input: UpdateProgramInput): Promise<IpcResult<ProgramRecord>> =>
      ipcRenderer.invoke('carreras:update', input),
    createPeriod: (input: CreatePeriodInput): Promise<IpcResult<PeriodRecord>> =>
      ipcRenderer.invoke('carreras:createPeriod', input),
    updatePeriod: (input: UpdatePeriodInput): Promise<IpcResult<PeriodRecord>> =>
      ipcRenderer.invoke('carreras:updatePeriod', input),
    deletePeriod: (id: number): Promise<IpcResult<DeletePeriodResult>> =>
      ipcRenderer.invoke('carreras:deletePeriod', { id }),
    delete: (id: number): Promise<IpcResult<DeleteProgramResult>> => ipcRenderer.invoke('carreras:delete', { id })
  },
  fechas: {
    list: (): Promise<IpcResult<AcademicDateWithProgram[]>> => ipcRenderer.invoke('fechas:list'),
    create: (input: CreateAcademicDateInput): Promise<IpcResult<AcademicDateRecord>> =>
      ipcRenderer.invoke('fechas:create', input),
    update: (input: UpdateAcademicDateInput): Promise<IpcResult<AcademicDateRecord>> =>
      ipcRenderer.invoke('fechas:update', input),
    delete: (id: number): Promise<IpcResult<DeleteAcademicDateResult>> => ipcRenderer.invoke('fechas:delete', { id })
  },
  finales: {
    create: (input: CreateFinalExamInput): Promise<IpcResult<FinalExamRecord>> =>
      ipcRenderer.invoke('finales:create', input),
    update: (input: UpdateFinalExamInput): Promise<IpcResult<FinalExamRecord>> =>
      ipcRenderer.invoke('finales:update', input),
    delete: (id: number): Promise<IpcResult<DeleteFinalExamResult>> => ipcRenderer.invoke('finales:delete', { id })
  },
  // No `list` here on purpose: parciales ride on `materias:detail`, the same
  // way final-exam records do.
  parciales: {
    create: (input: CreatePartialExamInput): Promise<IpcResult<PartialExamRecord>> =>
      ipcRenderer.invoke('parciales:create', input),
    update: (input: UpdatePartialExamInput): Promise<IpcResult<PartialExamRecord>> =>
      ipcRenderer.invoke('parciales:update', input),
    delete: (id: number): Promise<IpcResult<DeletePartialExamResult>> => ipcRenderer.invoke('parciales:delete', { id })
  },
  // Writes only, and every one addresses a subject plus a calendar DAY — a
  // clase is the pair, not a stored row. No `list` here on purpose: marks and
  // apuntes ride on `materias:detail` and `hoy:dashboard`.
  clases: {
    setAttendance: (input: SetAttendanceInput): Promise<IpcResult<AttendanceRecord>> =>
      ipcRenderer.invoke('clases:setAttendance', input),
    clearAttendance: (input: ClassDayInput): Promise<IpcResult<ClassDayResult>> =>
      ipcRenderer.invoke('clases:clearAttendance', input),
    saveNote: (input: SaveClassNoteInput): Promise<IpcResult<SaveClassNoteResult>> =>
      ipcRenderer.invoke('clases:saveNote', input),
    deleteNote: (input: ClassDayInput): Promise<IpcResult<ClassDayResult>> =>
      ipcRenderer.invoke('clases:deleteNote', input)
  },
  // Correlativas (writes only — they ride on `materias:list`/`materias:detail`
  // the way marks ride on `materias:detail`) plus the próximo-período draft,
  // which has no subject payload to ride on and so gets the one read channel.
  // There is deliberately no "confirm" command: drafting is not enrolling.
  planificador: {
    list: (): Promise<IpcResult<PlannerEntryRecord[]>> => ipcRenderer.invoke('planificador:list'),
    addPrerequisite: (input: AddPrerequisiteInput): Promise<IpcResult<SubjectPrerequisite>> =>
      ipcRenderer.invoke('planificador:addPrerequisite', input),
    updatePrerequisite: (input: UpdatePrerequisiteInput): Promise<IpcResult<SubjectPrerequisite>> =>
      ipcRenderer.invoke('planificador:updatePrerequisite', input),
    removePrerequisite: (id: number): Promise<IpcResult<DeletePrerequisiteResult>> =>
      ipcRenderer.invoke('planificador:removePrerequisite', { id }),
    addEntry: (input: PlannerEntryInput): Promise<IpcResult<PlannerEntryRecord>> =>
      ipcRenderer.invoke('planificador:addEntry', input),
    removeEntry: (input: PlannerEntryInput): Promise<IpcResult<PlannerEntryInput>> =>
      ipcRenderer.invoke('planificador:removeEntry', input)
  },
  horario: {
    week: (): Promise<IpcResult<WeekScheduleResult>> => ipcRenderer.invoke('horario:week')
  },
  hoy: {
    dashboard: (): Promise<IpcResult<DashboardResult>> => ipcRenderer.invoke('hoy:dashboard')
  },
  entregas: {
    create: (input: CreateDeadlineInput): Promise<IpcResult<DeadlineWithSubject>> =>
      ipcRenderer.invoke('entregas:create', input),
    list: (): Promise<IpcResult<DeadlineWithSubject[]>> => ipcRenderer.invoke('entregas:list'),
    update: (input: UpdateDeadlineInput): Promise<IpcResult<DeadlineWithSubject>> =>
      ipcRenderer.invoke('entregas:update', input),
    setDone: (input: SetDeadlineDoneInput): Promise<IpcResult<DeadlineWithSubject>> =>
      ipcRenderer.invoke('entregas:setDone', input),
    delete: (id: number): Promise<IpcResult<DeleteDeadlineResult>> => ipcRenderer.invoke('entregas:delete', { id })
  },
  adjuntos: {
    list: (subjectId: number): Promise<IpcResult<Attachment[]>> => ipcRenderer.invoke('adjuntos:list', { subjectId }),
    add: (input: AddAttachmentsInput): Promise<IpcResult<AddAttachmentsResult>> =>
      ipcRenderer.invoke('adjuntos:add', input),
    open: (id: number): Promise<IpcResult<undefined>> => ipcRenderer.invoke('adjuntos:open', { id }),
    remove: (id: number): Promise<IpcResult<DeleteAttachmentResult>> => ipcRenderer.invoke('adjuntos:delete', { id }),
    // Markdown viewer/editor (markdown-attachment-viewer): content crosses
    // the bridge as a STRING only, never a filesystem path. Channel names
    // come from the zod-free `channels` module — see its doc comment.
    read: (id: number): Promise<IpcResult<ReadAttachmentTextResult>> =>
      ipcRenderer.invoke(ADJUNTOS_READ_CHANNEL, { id }),
    write: (id: number, content: string): Promise<IpcResult<Attachment>> =>
      ipcRenderer.invoke(ADJUNTOS_WRITE_CHANNEL, { id, content }),
    createDocument: (input: CreateMarkdownDocumentInput): Promise<IpcResult<Attachment>> =>
      ipcRenderer.invoke(ADJUNTOS_CREATE_DOCUMENT_CHANNEL, input)
  },
  indexado: {
    sync: (): Promise<IpcResult<SyncResult>> => ipcRenderer.invoke('indexado:sync'),
    // Pushed whenever a background indexing job finishes (design "Renderer
    // notify"); the renderer's own listener/invalidation lands in slice 2c.
    // Returns an unsubscribe function (same shape as `onExportRequested`).
    onStatusChanged: (callback: (payload: IndexStatusChangedPayload) => void): (() => void) => {
      const listener = (_event: unknown, payload: IndexStatusChangedPayload) => callback(payload)
      ipcRenderer.on(INDEXADO_STATUS_CHANGED_CHANNEL, listener)
      return () => ipcRenderer.removeListener(INDEXADO_STATUS_CHANGED_CHANNEL, listener)
    }
  },
  cli: {
    probe: (input: ProbeCliInput): Promise<IpcResult<CliProviderStatus>> => ipcRenderer.invoke('cli:probe', input),
    setOverride: (input: SetCliOverrideInput): Promise<IpcResult<CliProviderStatus>> =>
      ipcRenderer.invoke('cli:setOverride', input),
    preferences: (): Promise<IpcResult<CliPreference[]>> => ipcRenderer.invoke('cli:preferences'),
    disconnect: (input: DisconnectCliInput): Promise<IpcResult<undefined>> =>
      ipcRenderer.invoke('cli:disconnect', input),
    models: (): Promise<IpcResult<DiscoveredModel[]>> => ipcRenderer.invoke('cli:models')
  },
  // Invoke-only: the answer returns on the question's own promise, cancel is
  // itself an invoke, and browse/load/delete are one-shot queries — this
  // domain adds no push channel constant.
  ask: {
    question: (input: AskQuestionInput): Promise<IpcResult<AskTurnResponse>> =>
      ipcRenderer.invoke('ask:question', input),
    cancel: (): Promise<IpcResult<undefined>> => ipcRenderer.invoke('ask:cancel'),
    listConversations: (): Promise<IpcResult<ConversationSummary[]>> => ipcRenderer.invoke('ask:listConversations'),
    getConversation: (input: GetConversationInput): Promise<IpcResult<GetConversationResult>> =>
      ipcRenderer.invoke('ask:getConversation', input),
    deleteConversation: (input: DeleteConversationInput): Promise<IpcResult<DeleteConversationResult>> =>
      ipcRenderer.invoke('ask:deleteConversation', input)
  },
  theme: {
    getPreference: (): Promise<IpcResult<ThemePreference>> => ipcRenderer.invoke('theme:getPreference'),
    // Applies `nativeTheme.themeSource` AND persists in one round trip; the
    // echoed value is what the renderer writes into its cache.
    setPreference: (input: SetThemePreferenceInput): Promise<IpcResult<ThemePreference>> =>
      ipcRenderer.invoke('theme:setPreference', input),
    getPalette: (): Promise<IpcResult<Palette>> => ipcRenderer.invoke('theme:getPalette'),
    // Persists only — the renderer is what puts the choice on
    // `<html data-palette>`, so there is no native counterpart to apply here.
    setPalette: (input: SetPaletteInput): Promise<IpcResult<Palette>> => ipcRenderer.invoke('theme:setPalette', input)
  },
  app: {
    openExternal: (input: OpenExternalInput): Promise<IpcResult<undefined>> =>
      ipcRenderer.invoke('app:openExternal', input),
    exportJson: (): Promise<IpcResult<ExportJsonResult>> => ipcRenderer.invoke('app:exportJson'),
    // Native File menu push event (design §1) — the renderer subscribes
    // once and triggers the SAME exportJson() call the sidebar footer uses.
    // Returns an unsubscribe function.
    onExportRequested: (callback: () => void): (() => void) => {
      const listener = () => callback()
      ipcRenderer.on(MENU_EXPORT_REQUESTED_CHANNEL, listener)
      return () => ipcRenderer.removeListener(MENU_EXPORT_REQUESTED_CHANNEL, listener)
    }
  }
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
