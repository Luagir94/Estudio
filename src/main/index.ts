import * as nodeFs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme } from 'electron'
import log from 'electron-log'
import { MENU_EXPORT_REQUESTED_CHANNEL } from '../shared/ipc/app'
import { INDEXADO_STATUS_CHANGED_CHANNEL } from '../shared/ipc/channels'
import { createAttachmentStorage } from './adjuntos/adapters/fileAttachmentStorage'
import { createSqliteAttachmentRepository } from './adjuntos/adapters/sqliteAttachmentRepository'
import { createAttachmentService } from './adjuntos/attachmentService'
import { registerAdjuntosHandlers } from './adjuntos/ipc/registerAdjuntosHandlers'
import { buildFileMenuTemplate } from './app/exportMenu'
import { createFatalStartupErrorReporter } from './app/fatalStartupError'
import { registerAppHandlers } from './app/registerAppHandlers'
import { createRepositoryAppDataReader } from './ask/adapters/repositoryAppDataReader'
import { createSqliteAskHistoryRepository } from './ask/adapters/sqliteAskHistoryRepository'
import { createAskService } from './ask/askService'
import { registerAskHandlers } from './ask/ipc/registerAskHandlers'
import { createSqliteProgramRepository } from './carreras/adapters/sqliteProgramRepository'
import { registerCarrerasHandlers } from './carreras/ipc/registerCarrerasHandlers'
import { openAppDatabase } from './db/connection'
import { backupAndMigrate } from './db/migrate'
import { createSqliteAppSettingsRepository } from './claude/adapters/sqliteAppSettingsRepository'
import { createCliProbeService, type AppSettingsPort } from './cli/cliProbeService'
import { registerCliHandlers } from './cli/ipc/registerCliHandlers'
import { createModelCatalog } from './cli/modelCatalog'
import { validateExecutableCandidate } from './claude/claudeExecutableValidator'
import { resolveExecutable } from './claude/domain/executableResolver'
import { createPromptSpawnRouter } from './claude/promptSpawnRouter'
import { createWarmPromptSession, type WarmPromptSession } from './claude/warmPromptSession'
import { clearProvider, validateModelId } from './claude/claudeExecutableValidator'
import { PROVIDER_SPECS } from './cli/providerSpec'
import { createSqliteClaseRepository } from './clases/adapters/sqliteClaseRepository'
import { createSqliteClassNoteBackfillPorts } from './clases/adapters/sqliteClassNoteBackfillPorts'
import { backfillClassNotes } from './clases/classNoteBackfill'
import { registerClasesHandlers } from './clases/ipc/registerClasesHandlers'
import { createSqliteDeadlineRepository } from './entregas/adapters/sqliteDeadlineRepository'
import { createSqliteAcademicDateRepository } from './fechas/adapters/sqliteAcademicDateRepository'
import { registerFechasHandlers } from './fechas/ipc/registerFechasHandlers'
import { createSqliteFinalExamRepository } from './finales/adapters/sqliteFinalExamRepository'
import { registerFinalesHandlers } from './finales/ipc/registerFinalesHandlers'
import { createSqlitePartialExamRepository } from './parciales/adapters/sqlitePartialExamRepository'
import { registerParcialesHandlers } from './parciales/ipc/registerParcialesHandlers'
import { createSqlitePlannerRepository } from './planificador/adapters/sqlitePlannerRepository'
import { registerPlanificadorHandlers } from './planificador/ipc/registerPlanificadorHandlers'
import { registerEntregasHandlers } from './entregas/ipc/registerEntregasHandlers'
import { registerHoyHandlers } from './hoy/ipc/registerHoyHandlers'
import { createSqliteChunkStore } from './indexado/adapters/sqliteChunkStore'
import { createSqliteIndexStatusRepository } from './indexado/adapters/sqliteIndexStatusRepository'
import { createIndexadoService } from './indexado/indexadoService'
import { registerIndexadoHandlers } from './indexado/ipc/registerIndexadoHandlers'
import { createSqliteSubjectRepository } from './materias/adapters/sqliteSubjectRepository'
import { registerMateriasHandlers } from './materias/ipc/registerMateriasHandlers'
import { registerHorarioHandlers } from './horario/ipc/registerHorarioHandlers'
import { createThemeService } from './theme/themeService'
import { registerThemeHandlers } from './theme/ipc/registerThemeHandlers'
import { applyContentSecurityPolicy, createMainWindow } from './window'

const isMac = process.platform === 'darwin'

function getMigrationsFolder(): string {
  return path.join(app.getAppPath(), 'drizzle/migrations')
}

function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'course-companion.db')
}

// The ONLY place `app.getPath('userData')` is resolved for attachments
// (design "Storage port") — everywhere else, `rootDir` is injected, which is
// what keeps `fileAttachmentStorage.ts` free of any Electron import.
function getAttachmentsRootDir(): string {
  return path.join(app.getPath('userData'), 'attachments')
}

async function createWindow(): Promise<void> {
  const window = createMainWindow()
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Runs ONCE per app launch: hardening, migration, DB connection, and IPC
 * handler registration all happen before the first window opens (design
 * §7; delivery decision "security-ordering defect"). `app.on('activate')`
 * only needs to recreate the window, never repeat this setup.
 */
async function bootstrap(): Promise<void> {
  // ELECTRON_RENDERER_URL is set only when the Vite dev server is serving the
  // renderer — the same signal createWindow() uses to pick its load path.
  applyContentSecurityPolicy(undefined, {
    isDevelopment: Boolean(process.env.ELECTRON_RENDERER_URL)
  })

  // Forward-only migrations run at startup, before any window loads
  // (design §3), and are always preceded by a backup when a migration
  // is actually pending.
  backupAndMigrate({
    dbPath: getDatabasePath(),
    migrationsFolder: getMigrationsFolder()
  })

  const { db, raw } = openAppDatabase(getDatabasePath())
  // Both handler sets share ONE repository instance: horario:week is a
  // read-only projection over the same subjects+slots data materias:list
  // serves (design §2), never a separate table or write path.
  const subjectRepository = createSqliteSubjectRepository(db)
  const attachmentStorage = createAttachmentStorage({ rootDir: getAttachmentsRootDir() })
  registerMateriasHandlers(subjectRepository, { attachmentStorage })
  registerHorarioHandlers(subjectRepository)
  // Deadline is NOT owned by the Subject aggregate for lifecycle purposes
  // (design amendment 7) — its own repository, separate from subjectRepository.
  const deadlineRepository = createSqliteDeadlineRepository(db)
  registerEntregasHandlers(deadlineRepository)
  // Attendance marks and class apuntes are anchored by `(subjectId, date)`,
  // never by a schedule slot — see the `attendance_records` table comment in
  // db/schema.ts. Held in a variable because BOTH `clases:*` (the writes) and
  // `hoy:dashboard` (a read) use this same instance, the way
  // subjectRepository is already shared.
  const claseRepository = createSqliteClaseRepository(db)
  // `registerClasesHandlers` is NOT called here, even though this is where its
  // repository is born: an apunte is a markdown attachment now, so the note
  // commands need `attachmentService`, which cannot exist until the storage
  // and indexing ports below are wired. The registration therefore happens
  // right after that service — see "clases:* note commands" further down.
  // Read-model query over the SAME three repositories — no separate table and
  // no write path of its own (the class marks Hoy now offers are written
  // through `clases:*`, above).
  registerHoyHandlers(subjectRepository, deadlineRepository, claseRepository)
  // Program is the aggregate root for periods, so `carreras:*` owns both
  // commands — a period without a program is not representable. Held in a
  // variable rather than inlined because the ask slice reads the SAME
  // instance below, the way subjectRepository is already shared.
  const programRepository = createSqliteProgramRepository(db)
  registerCarrerasHandlers(programRepository)
  // FinalExam rows are cascade-deleted with their subject but own their
  // lifecycle, so they get their own repository and command set.
  const finalExamRepository = createSqliteFinalExamRepository(db)
  registerFinalesHandlers(finalExamRepository)
  // Parciales follow the SAME shape as final exams: cascade-deleted with the
  // subject, own lifecycle, own repository and command set. They are read
  // through `materias:detail` (no `parciales:list` channel exists), so this
  // instance is not shared with anything else.
  registerParcialesHandlers(createSqlitePartialExamRepository(db))
  // Administrative dates hang off the PROGRAM (cascade-deleted with it) and
  // own their lifecycle, so — like final exams — they get their own
  // repository and command set rather than riding inside `carreras:*`.
  registerFechasHandlers(createSqliteAcademicDateRepository(db))
  // Correlativas and the próximo-período draft. Its own repository even though
  // `subjectRepository` READS the correlativa rows into the subject payloads:
  // that read is a join, this is the lifecycle, and the same split already
  // separates `clases:*`'s writes from the marks `materias:detail` carries.
  // Not shared with anything else, so it is not held in a variable.
  registerPlanificadorHandlers(createSqlitePlannerRepository(db))
  registerAppHandlers({ subjectRepository, deadlineRepository })

  // Attachment rows cascade-delete with their subject (PR1, pure FK); the
  // files on disk do not, which is why registerMateriasHandlers above also
  // needs attachmentStorage (design "subject cascade").
  const attachmentRepository = createSqliteAttachmentRepository(db)

  // attachment-fts-index (slice 2b): the indexing pipeline is wired BEFORE
  // `attachmentService` below, because `attachmentService` needs the
  // resulting `indexadoService` as its `AttachmentIndexerPort` — fired
  // fire-and-forget right after a successful insert (design "Port
  // Contracts" / spec "Non-blocking upload"). `chunkStore` uses the RAW
  // handle (FTS5 `MATCH`/`bm25()` have no drizzle equivalent, design
  // "Storage"); `indexStatusRepository` uses typed drizzle over the same
  // `attachments` table `attachmentRepository` already reads.
  const indexStatusRepository = createSqliteIndexStatusRepository(db)
  const chunkStore = createSqliteChunkStore(raw)
  // Fans out to every window — a status change (e.g. from Sincronizar)
  // must reach every open renderer, not just the focused one (design
  // "Renderer notify"; contrast with the single-focused-window
  // `MENU_EXPORT_REQUESTED_CHANNEL` push below). Kept as a plain function
  // here so neither `indexadoService.ts` nor `attachmentService.ts` (which
  // fires it when a markdown save flips a row back to 'pending') ever
  // imports Electron.
  const notifyStatusChanged = (subjectId: number): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(INDEXADO_STATUS_CHANGED_CHANNEL, { subjectId })
    }
  }
  const indexadoService = createIndexadoService({
    statusRepository: indexStatusRepository,
    chunkStore,
    resolveStoredPath: attachmentStorage.resolveStoredPath,
    notifyStatusChanged
  })
  registerIndexadoHandlers({ service: indexadoService })

  // Held in a variable — same single-instance-shared pattern as
  // `subjectRepository`/`appSettingsRepository` above — because `askService`
  // below ALSO wires it in as `generatedArtifacts` (cli-generated-artifacts
  // design "Port Contract + Orchestration"): the generated-artifact write
  // path is not a second implementation, it is this exact same service.
  const attachmentService = createAttachmentService({
    repository: attachmentRepository,
    storage: attachmentStorage,
    indexer: indexadoService,
    notifyStatusChanged
  })

  registerAdjuntosHandlers({
    repository: attachmentRepository,
    service: attachmentService,
    storage: attachmentStorage,
    subjectRepository
  })

  // clases:* note commands. Deferred from where `claseRepository` was created
  // (above) purely by dependency order: an apunte is a markdown ATTACHMENT, so
  // writing one means a file, a preview and an FTS re-index — and that is
  // `attachmentService`, which only exists from here down.
  //
  // The port is adapted inline rather than passing the whole service: the
  // clases slice states the two verbs it needs (`ClassNoteWriterPort`) and
  // gets exactly those, so it can never grow a second way to write a file.
  registerClasesHandlers(claseRepository, {
    save: async (subjectId, classDate, content) => {
      const result = await attachmentService.saveClassNote(subjectId, classDate, content)
      if (!result.ok) return result
      return result.deleted ? { ok: true, deleted: true } : { ok: true, deleted: false, apunteId: result.attachment.id }
    },
    remove: (subjectId, classDate) => attachmentService.deleteClassNote(subjectId, classDate)
  })

  // Moves any apunte still living as a `class_notes` ROW into the attachment
  // it is now. A SQL migration cannot do this — every legacy apunte has to
  // become a FILE — so it runs here, once the write path it needs exists.
  //
  // NOT awaited: the table drains a few rows at a time and the window must
  // not wait on disk to appear. Idempotent and self-draining, so a boot that
  // dies mid-migration simply resumes on the next one.
  void backfillClassNotes(
    createSqliteClassNoteBackfillPorts(db, (subjectId, classDate, content) =>
      attachmentService.saveClassNote(subjectId, classDate, content)
    )
  )

  // CLI detection/probe, once per supported provider.
  // `createSqliteAppSettingsRepository` satisfies the probe service's
  // `AppSettingsPort` (`get`) AND is passed to the handlers for its
  // `set`/`delete` side — same single-instance-shared-across-handlers
  // pattern as `subjectRepository` above.
  //
  // Held in a variable because `askService` reads the SAME instance below:
  // the capabilities this probe observed are what decide whether a provider
  // whose argv template was never verified may be spawned at all. Two probe
  // instances would mean the settings screen and the ask panel disagreeing
  // about which CLIs work.
  const appSettingsRepository = createSqliteAppSettingsRepository(db)

  // Theme preference (Ajustes "Apariencia"). The renderer's entire theming
  // hangs off `prefers-color-scheme`, and `nativeTheme.themeSource` is the one
  // Electron switch that changes how that media query resolves — so the whole
  // feature is this service plus two `theme:*` channels, and no renderer CSS
  // changes. Applied HERE, before `createWindow()` below, so the first paint
  // already resolves the way the student chose last session instead of
  // flashing the OS theme first. The setter is injected as a function to keep
  // `themeService.ts` free of any Electron import (same convention as
  // `notifyStatusChanged` above).
  const themeService = createThemeService({
    settings: appSettingsRepository,
    applyThemeSource: (source) => {
      nativeTheme.themeSource = source
    }
  })
  themeService.applyStoredPreference()
  registerThemeHandlers({ themeService })

  const cliProbeService = createCliProbeService({ settings: appSettingsRepository })
  registerCliHandlers({
    probeService: cliProbeService,
    settings: appSettingsRepository,
    settingsRepository: appSettingsRepository,
    // Reads the CLI's own state file, never a spawn: the model list is the
    // one thing no CLI of the three will answer a question about.
    modelCatalog: createModelCatalog()
  })

  // Ask-my-materials (design D1/D3/D6). Shares the SAME subject, attachment
  // and settings instances as the handlers above — the corpus it answers
  // from is exactly what the student already sees in Materias, never a
  // separate index. `getAttachmentsRootDir()` stays the single place
  // `userData` is resolved for attachments; the validator re-asserts it
  // before it reaches any command line.
  // The attachments root is the spawned CLI's `cwd`, and the storage adapter
  // only creates it when the FIRST file is copied in. On a profile that never
  // uploaded anything the directory does not exist, and spawning there fails
  // with ENOENT — which the service would honestly but misleadingly report as
  // a missing CLI. Creating it up front costs one syscall and removes the
  // whole class of confusion.
  await nodeFs.mkdir(getAttachmentsRootDir(), { recursive: true })

  // Same `db` instance as every other repository above — conversations have
  // no FK to subjects/programs (design D4), but they still live in the app's
  // one database file.
  const askHistoryRepository = createSqliteAskHistoryRepository(db)

  // ONE CLI process serves every CLAUDE question instead of one per question.
  // That spawn was the app's single biggest source of answer latency: measured
  // on a Windows dev machine, a trivial question cost ~15.5s through a fresh
  // `-p` spawn while the CLI reported only ~4s of it as inference. The same
  // question on a live process costs ~5.5s including the `/clear` the session
  // sends to keep turns isolated. `askService` is untouched by this — the
  // session hands it a handle that behaves exactly like a dedicated child.
  //
  // Claude is also the ONLY provider the session can serve (its module
  // comment: the other two CLIs read a prompt, answer, and exit), so the
  // router below sends only streaming-capable providers through it and the
  // rest through the same one-shot pair `askService` defaults to. Wiring the
  // session raw here is what once hung antigravity questions to their
  // five-minute timeout — and is now a compile error.
  const warmPromptSession = createWarmPromptSession()
  const promptSpawnRouter = createPromptSpawnRouter({ warmSession: warmPromptSession })
  const askService = createAskService({
    settings: appSettingsRepository,
    subjectRepository,
    attachmentRepository,
    // `chunkStore` (created above, ahead of `indexadoService`) satisfies
    // `AskAttachmentIndexPort` structurally — same `AskAttachmentPort`
    // consumer-owned-port convention (attachment-fts-index design "Port
    // Contracts"): ask stays FTS-ignorant, `search()` calls `buildMatchQuery`
    // internally.
    attachmentIndex: chunkStore,
    appData: createRepositoryAppDataReader({
      subjectRepository,
      deadlineRepository,
      finalExamRepository,
      programRepository
    }),
    attachmentsRoot: getAttachmentsRootDir(),
    history: askHistoryRepository,
    // `attachmentService.addGeneratedAttachment` satisfies
    // `AskGeneratedArtifactPort` structurally (design "Port Contract +
    // Orchestration") — the SAME service the upload path
    // (`registerAdjuntosHandlers` above) uses, never a parallel write
    // mechanism. Adapted from positional args to the port's object shape.
    generatedArtifacts: {
      saveGenerated: (input) => attachmentService.addGeneratedAttachment(input.subjectId, input.fileName, input.content)
    },
    spawnPrompt: promptSpawnRouter.spawnPrompt,
    terminate: promptSpawnRouter.terminate,
    // The settings screen's observations, reused. A provider stays unusable
    // until this reports that the installed binary lists the flags its
    // template needs.
    capabilities: cliProbeService.capabilities
  })
  registerAskHandlers({ askService, askHistoryRepository })

  // Pays the CLI's boot cost NOW, while the user is still looking at the
  // window, so the first question of the launch is as fast as the rest.
  // Entirely best-effort: it resolves and validates on its own and stays
  // silent on failure, because the first question does the same chain for
  // itself and is the honest place for a degraded CLI to be reported.
  //
  // The model is the panel's own default (`modelPreference.ts`), duplicated
  // rather than imported — main must not reach into the renderer, and the
  // real preference lives in that window's localStorage. A user whose stored
  // choice differs simply has this process replaced by their first question:
  // one wasted boot, never a wrong model on an answer.
  void warmUpClaude(warmPromptSession, appSettingsRepository)

  // Best-effort on quit: the shim branch runs the CLI as a grandchild of
  // cmd.exe, so leaving it unreaped would burn the user's own tokens after
  // the window is gone. The warm process outlives any single question, so it
  // needs disposing too — cancelling only settles the question in flight.
  app.on('will-quit', () => {
    askService.cancel()
    warmPromptSession.dispose()
  })

  // Native File menu (spec: "Export from File menu" — "the same export flow
  // triggers as from the sidebar footer"). The click handler runs in MAIN,
  // so it pushes menu:export-requested to the focused renderer instead of
  // duplicating the export flow (see exportMenu.ts's own doc comment).
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildFileMenuTemplate(() => {
        const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        targetWindow?.webContents.send(MENU_EXPORT_REQUESTED_CHANNEL)
      })
    )
  )

  await createWindow()
}

// Registered before whenReady so a failure at ANY point of startup — the
// migration, the DB open, or a stray rejection — surfaces as one dialog and
// a clean quit instead of a silent windowless process. `dialog.showErrorBox`
// is the one dialog API Electron documents as safe before app `ready`.
const reportFatalStartupError = createFatalStartupErrorReporter({
  logError: (message, error) => log.error(message, error),
  showErrorBox: (title, content) => dialog.showErrorBox(title, content),
  quit: () => app.quit()
})

process.on('unhandledRejection', reportFatalStartupError)
process.on('uncaughtException', reportFatalStartupError)

app.whenReady().then(() => {
  bootstrap().catch(reportFatalStartupError)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

/**
 * The model the warm process is booted with — the panel's own default,
 * duplicated rather than imported, because main must not reach into the
 * renderer and the real preference lives in that window's localStorage.
 * A user whose stored choice differs simply has this process replaced by
 * their first question: one wasted boot, never a wrong model on an answer.
 */
const WARM_UP_MODEL = 'claude-sonnet-5'

/**
 * Boots the shared CLI process ahead of the first question, using the SAME
 * override → resolve → validate chain `askService` runs per question, so the
 * process warmed here is the one that question would have spawned anyway.
 *
 * Swallows every failure on purpose: a warm-up that cannot resolve or
 * validate the CLI leaves the app exactly where it was before this existed,
 * and the first question owns the user-facing report of a degraded CLI.
 */
async function warmUpClaude(session: WarmPromptSession, settings: AppSettingsPort): Promise<void> {
  try {
    const spec = PROVIDER_SPECS.claude
    const overridePath = settings.get(spec.overrideKey)
    const candidatePath =
      overridePath ?? (await resolveExecutable(spec.executableName, { env: process.env, fs: nodeFs }))
    if (!candidatePath) return

    const validated = await validateExecutableCandidate(candidatePath, { fs: nodeFs })
    if (!validated) return

    // Claude is the only provider with a warm session at all — the other two
    // CLIs answer and exit, so there is nothing to keep alive. Both brands are
    // minted here rather than asserted: the warm-up must not be able to start
    // a process the per-question path would have refused.
    const cleared = clearProvider('claude', null)
    const model = validateModelId(WARM_UP_MODEL)
    if (!cleared || !model) return

    session.warmUp(cleared, validated, getAttachmentsRootDir(), model)
  } catch {
    // Deliberately silent — see the doc comment above.
  }
}
