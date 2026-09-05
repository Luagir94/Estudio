import {
  copyFile as fsCopyFile,
  readFile as fsReadFile,
  rename as fsRename,
  stat as fsStat,
  writeFile as fsWriteFile
} from 'node:fs/promises'
import { homedir as osHomedir } from 'node:os'
import path from 'node:path'
import log from 'electron-log'
import type { McpClientTarget, McpClientTargetStatus, McpClientConfigWriteResult } from '../../../shared/ipc/mcp'
import { ENABLED_MCP_CLIENT_TARGETS } from '../../../shared/ipc/mcp'
import { type ClientConfigFormat, targetSpec } from '../domain/clientTargetSpec'
import {
  COURSE_COMPANION_SERVER_KEY,
  type McpServerEntry,
  mergeClientConfig,
  type MergeResult,
  removeClientConfig
} from '../domain/mergeClientConfig'
import { mergeTomlClientConfig, removeTomlClientConfig } from '../domain/mergeTomlClientConfig'

// The only module in this feature that touches a filesystem — and the only one
// that touches a file this app does NOT own. Everything it writes goes through
// `mergeClientConfig`, which is pure and fails closed, so nothing here decides
// what the new contents should be; it only decides whether writing them is safe
// and how to do it without leaving a corpse behind.
//
// Nothing here spawns a process. That is deliberate and load-bearing: the
// obvious alternative — shelling out to `claude mcp add --env TOKEN=...` —
// would put the plaintext token on a command line, which this feature's own
// threat model forbids by construction (see `src/shared/mcp/endpoint.ts`,
// "Token in pipe name / argv / log"). Writing the file directly is both safer
// and the reason the `child-process-only-in-claude-validator` dependency-guard
// rule gains no new exemption.

/** Suffix of the copy taken before every write that changes anything. */
const BACKUP_SUFFIX = '.course-companion-backup'

/** Suffix of the sibling written before the atomic rename. */
const TEMP_SUFFIX = '.course-companion.tmp'

export interface ClientConfigWriterDeps {
  readFile?: (filePath: string) => Promise<string>
  writeFile?: (filePath: string, data: string) => Promise<void>
  rename?: (from: string, to: string) => Promise<void>
  copyFile?: (from: string, to: string) => Promise<void>
  directoryExists?: (dirPath: string) => Promise<boolean>
  homedir?: () => string
  logger?: Pick<typeof log, 'info' | 'error'>
}

/** Why a write refused, in the vocabulary the IPC layer reports to the renderer. */
export type ClientConfigFailureCode =
  'TARGET_NOT_OFFERED' | 'CONFIG_UNREADABLE' | 'CONFIG_NOT_UNDERSTOOD' | 'WRITE_FAILED'

export type ClientConfigOutcome =
  { ok: true; result: McpClientConfigWriteResult } | { ok: false; code: ClientConfigFailureCode; message: string }

export interface ClientConfigWriter {
  /** Never rejects: the settings screen must render even when a client's own file is broken. */
  list(): Promise<McpClientTargetStatus[]>
  write(target: McpClientTarget, entry: McpServerEntry): Promise<ClientConfigOutcome>
  remove(target: McpClientTarget): Promise<ClientConfigOutcome>
}

const isEnoent = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'

const message = (error: unknown): string => (error instanceof Error ? error.message : 'Unknown error')

/** Maps a pure merge refusal onto the failure the renderer sees. */
const REFUSAL_MESSAGES = {
  unparseable: 'the client config file is not valid JSON',
  'not-an-object': 'the client config file does not hold a JSON object',
  'servers-not-an-object': 'the client config file holds an unexpected shape under its servers key',
  'servers-not-tables': 'the client config file states its MCP servers in a shape this app cannot edit safely'
} as const

/**
 * The merge that understands this client's file.
 *
 * Branching on the format the SPEC declares, never on the target's name: a
 * fourth client arriving with a TOML config is a row in that table, not a
 * branch added here.
 */
const MERGES: Record<
  ClientConfigFormat,
  {
    write: (raw: string | null, key: string, entry: McpServerEntry) => MergeResult
    remove: (raw: string | null, key: string) => MergeResult
  }
> = {
  json: { write: mergeClientConfig, remove: removeClientConfig },
  toml: { write: mergeTomlClientConfig, remove: removeTomlClientConfig }
}

export function createClientConfigWriter({
  readFile = (filePath) => fsReadFile(filePath, 'utf8'),
  writeFile = (filePath, data) => fsWriteFile(filePath, data, 'utf8'),
  rename = fsRename,
  copyFile = fsCopyFile,
  directoryExists = async (dirPath) => {
    try {
      return (await fsStat(dirPath)).isDirectory()
    } catch {
      return false
    }
  },
  homedir = osHomedir,
  logger = log
}: ClientConfigWriterDeps = {}): ClientConfigWriter {
  const resolve = (segments: readonly string[]): string => path.join(homedir(), ...segments)

  /**
   * Reads the client's config, distinguishing "not there yet" from "there and
   * unreadable". Only the first is ordinary: an absent file is what every
   * never-configured client looks like, while a file we cannot read is a file
   * we must not replace.
   */
  async function readConfig(
    configPath: string
  ): Promise<{ ok: true; raw: string | null } | { ok: false; code: 'CONFIG_UNREADABLE'; message: string }> {
    try {
      return { ok: true, raw: await readFile(configPath) }
    } catch (error) {
      if (isEnoent(error)) {
        return { ok: true, raw: null }
      }
      return { ok: false, code: 'CONFIG_UNREADABLE', message: message(error) }
    }
  }

  /**
   * Applies one already-computed merge: no-op stays a no-op (no backup, no
   * write), and anything else is backed up, written to a sibling, then renamed
   * over the target so a crash mid-write cannot truncate the user's file.
   */
  async function commit(
    target: McpClientTarget,
    configPath: string,
    hadFile: boolean,
    merged: MergeResult
  ): Promise<ClientConfigOutcome> {
    if (!merged.ok) {
      logger.error(`mcp client config: target=${target} refused — ${REFUSAL_MESSAGES[merged.reason]}`)
      return { ok: false, code: 'CONFIG_NOT_UNDERSTOOD', message: REFUSAL_MESSAGES[merged.reason] }
    }

    if (!merged.changed) {
      logger.info(`mcp client config: target=${target} already current — nothing written`)
      return { ok: true, result: { target, configPath, changed: false, backupPath: null } }
    }

    const backupPath = hadFile ? `${configPath}${BACKUP_SUFFIX}` : null
    const tempPath = `${configPath}${TEMP_SUFFIX}`

    try {
      if (backupPath) {
        await copyFile(configPath, backupPath)
      }
      await writeFile(tempPath, merged.contents)
      await rename(tempPath, configPath)
    } catch (error) {
      logger.error(`mcp client config: target=${target} write failed`, error)
      return { ok: false, code: 'WRITE_FAILED', message: message(error) }
    }

    logger.info(`mcp client config: target=${target} written path=${configPath} backup=${backupPath ?? 'none'}`)
    return { ok: true, result: { target, configPath, changed: true, backupPath } }
  }

  /** Shared prologue: resolve the spec, read the file, or explain why not. */
  async function open(
    target: McpClientTarget
  ): Promise<
    | { ok: true; configPath: string; serversKey: string; format: ClientConfigFormat; raw: string | null }
    | { ok: false; code: ClientConfigFailureCode; message: string }
  > {
    const spec = targetSpec(target)
    if (!spec) {
      return { ok: false, code: 'TARGET_NOT_OFFERED', message: 'this MCP client is not offered in this build' }
    }

    const configPath = resolve(spec.configSegments)
    const read = await readConfig(configPath)
    if (!read.ok) {
      return read
    }

    return { ok: true, configPath, serversKey: spec.serversKey, format: spec.format, raw: read.raw }
  }

  return {
    async list(): Promise<McpClientTargetStatus[]> {
      return Promise.all(
        ENABLED_MCP_CLIENT_TARGETS.map(async (target): Promise<McpClientTargetStatus> => {
          // Every enabled target has a spec — `clientTargetSpec.test.ts` is
          // what keeps that true — so the fallbacks below only exist to keep
          // this listing total rather than throwing on a drift a test catches.
          const spec = targetSpec(target)
          const configPath = spec ? resolve(spec.configSegments) : ''
          const detected = spec ? await directoryExists(resolve(spec.detectSegments)) : false

          return {
            target,
            configPath,
            detected,
            connected: spec ? await isConnected(configPath, spec.serversKey, spec.format) : false
          }
        })
      )
    },

    async write(target, entry) {
      const opened = await open(target)
      if (!opened.ok) {
        return opened
      }

      return commit(
        target,
        opened.configPath,
        opened.raw !== null,
        MERGES[opened.format].write(opened.raw, opened.serversKey, entry)
      )
    },

    async remove(target) {
      const opened = await open(target)
      if (!opened.ok) {
        return opened
      }

      return commit(
        target,
        opened.configPath,
        opened.raw !== null,
        MERGES[opened.format].remove(opened.raw, opened.serversKey)
      )
    }
  }

  /**
   * Whether our entry is in the client's file RIGHT NOW. Read from the file
   * rather than from a settings row this app keeps: a row records what this app
   * did, and the file is the only thing the client actually obeys — a user who
   * edited it by hand must see the truth, not our memory of it.
   */
  async function isConnected(configPath: string, serversKey: string, format: ClientConfigFormat): Promise<boolean> {
    try {
      const raw = await readFile(configPath)

      // For TOML the question "is our block in there" is answered by the
      // removal itself: `changed` is true exactly when there was a block of
      // ours to take out. Asking the merge rather than a second regex here
      // means the listing and the write can never disagree about what counts
      // as our entry.
      if (format === 'toml') {
        const removal = removeTomlClientConfig(raw, serversKey)
        return removal.ok && removal.changed
      }

      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return false
      }
      const servers = (parsed as Record<string, unknown>)[serversKey]
      return typeof servers === 'object' && servers !== null && COURSE_COMPANION_SERVER_KEY in servers
    } catch {
      return false
    }
  }
}
