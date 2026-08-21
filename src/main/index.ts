import * as nodeFs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import { MENU_EXPORT_REQUESTED_CHANNEL } from '../shared/ipc/app'
import { INDEXADO_STATUS_CHANGED_CHANNEL } from '../shared/ipc/channels'
import { createAttachmentStorage } from './adjuntos/adapters/fileAttachmentStorage'
import { createSqliteAttachmentRepository } from './adjuntos/adapters/sqliteAttachmentRepository'
import { createAttachmentService } from './adjuntos/attachmentService'
import { registerAdjuntosHandlers } from './adjuntos/ipc/registerAdjuntosHandlers'
import { buildFileMenuTemplate } from './app/exportMenu'
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
import { createWarmPromptSession, type WarmPromptSession } from './claude/warmPromptSession'
import { clearProvider, validateModelId } from './claude/claudeExecutableValidator'
import { PROVIDER_SPECS } from './cli/providerSpec'
import { createSqliteDeadlineRepository } from './entregas/adapters/sqliteDeadlineRepository'
import { createSqliteFinalExamRepository } from './finales/adapters/sqliteFinalExamRepository'
import { registerFinalesHandlers } from './finales/ipc/registerFinalesHandlers'
import { registerEntregasHandlers } from './entregas/ipc/registerEntregasHandlers'
import { registerHoyHandlers } from './hoy/ipc/registerHoyHandlers'
import { createSqliteChunkStore } from './indexado/adapters/sqliteChunkStore'
import { createSqliteIndexStatusRepository } from './indexado/adapters/sqliteIndexStatusRepository'
import { createIndexadoService } from './indexado/indexadoService'
import { registerIndexadoHandlers } from './indexado/ipc/registerIndexadoHandlers'
import { createSqliteSubjectRepository } from './materias/adapters/sqliteSubjectRepository'
import { registerMateriasHandlers } from './materias/ipc/registerMateriasHandlers'
import { registerHorarioHandlers } from './horario/ipc/registerHorarioHandlers'
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
  // Pure read-model query over the SAME two repositories — no separate
  // table, no write path (design §2; spec: "Hoy MUST be a pure read-model").
  registerHoyHandlers(subjectRepository, deadlineRepository)
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
  const indexadoService = createIndexadoService({
    statusRepository: indexStatusRepository,
    chunkStore,
    resolveStoredPath: attachmentStorage.resolveStoredPath,
    // Fans out to every window — a status change (e.g. from Sincronizar)
    // must reach every open renderer, not just the focused one (design
    // "Renderer notify"; contrast with the single-focused-window
    // `MENU_EXPORT_REQUESTED_CHANNEL` push below). Kept as a plain function
    // here so `indexadoService.ts` itself never imports Electron.
    notifyStatusChanged: (subjectId) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(INDEXADO_STATUS_CHANGED_CHANNEL, { subjectId })
      }
    }
  })
  registerIndexadoHandlers({ service: indexadoService })

  registerAdjuntosHandlers({
    repository: attachmentRepository,
    service: createAttachmentService({
      repository: attachmentRepository,
      storage: attachmentStorage,
      indexer: indexadoService
    }),
    storage: attachmentStorage,
    subjectRepository
  })

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

  // ONE CLI process serves every question instead of one per question. That
  // spawn was the app's single biggest source of answer latency: measured on
  // a Windows dev machine, a trivial question cost ~15.5s through a fresh
  // `-p` spawn while the CLI reported only ~4s of it as inference. The same
  // question on a live process costs ~5.5s including the `/clear` the session
  // sends to keep turns isolated. `askService` is untouched by this — the
  // session hands it a handle that behaves exactly like a dedicated child.
  const warmPromptSession = createWarmPromptSession()
  const askService = createAskService({
    settings: appSettingsRepository,
    subjectRepository,
    attachmentRepository,
    appData: createRepositoryAppDataReader({
      subjectRepository,
      deadlineRepository,
      finalExamRepository,
      programRepository
    }),
    attachmentsRoot: getAttachmentsRootDir(),
    history: askHistoryRepository,
    spawnPrompt: warmPromptSession.spawnPrompt,
    terminate: warmPromptSession.terminate,
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

app.whenReady().then(() => {
  void bootstrap()

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
