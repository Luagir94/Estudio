// The config-file vocabulary of each MCP client this app can register itself
// in, as DATA rather than as code — the same shape and the same discipline as
// `src/main/cli/providerSpec.ts`: this module imports nothing but a type,
// spawns nothing, and touches no filesystem.
//
// It holds ONLY enabled targets. `MCP_CLIENT_TARGET_VALUES` is deliberately
// wider so a persisted row naming a future client still parses, but a spec
// written from documentation and never run is not knowledge — it is a guess
// with a path in it, and a wrong path here means writing a config file
// somewhere no client will ever read. A target earns a row by being run.
import type { McpClientTarget } from '../../../shared/ipc/mcp'

export interface McpTargetSpec {
  /** Config file to merge into, as path segments under the user's home directory. */
  configSegments: readonly string[]
  /**
   * Directory whose existence means "this client is installed here".
   *
   * A directory, not an executable on `PATH`: `cliProbeService` resolves
   * binaries because it has to spawn them, and this feature never spawns
   * anything. Some of these clients are GUI apps that are not on `PATH` at all.
   */
  detectSegments: readonly string[]
  /** Key holding the client's server map. `mcpServers` for every JSON client verified so far. */
  serversKey: string
  /** Human label for the settings screen. */
  label: string
  /** What was actually run to earn this row — the honest half of the table. */
  verified: string
}

/**
 * `~/.claude.json` is Claude Code's user-scope state file, and `mcpServers` at
 * its top level is the user-scope server map — the one that applies in every
 * project, which is what a student wants for their own academic data.
 *
 * This app already READS that same file: `src/main/cli/modelCatalog.ts` parses
 * it to discover model ids. Writing it is the same file, one key over — which
 * is also why the merge fails closed rather than recreating it: the file
 * carries the user's entire Claude Code state alongside our one entry.
 */
export const MCP_TARGET_SPECS: Readonly<Record<McpClientTarget, McpTargetSpec | undefined>> = {
  'claude-code': {
    configSegments: ['.claude.json'],
    detectSegments: ['.claude'],
    serversKey: 'mcpServers',
    label: 'Claude Code',
    verified: 'claude 2.x on Windows, 2026-09-05 — read back with `claude mcp list`'
  },

  // The path here is the one observation the documentation would NOT have
  // given, and getting it wrong would have written a file nothing ever reads:
  // `~/.gemini/` holds THREE `mcp_config.json` files on a machine that has run
  // both the Antigravity CLI and the IDE — `config/`, `antigravity/` and
  // `antigravity-cli/`. Only `config/` is the CLI's: `agy mcp add` wrote there
  // and `agy mcp list` read it back, while the two servers sitting in
  // `antigravity-cli/mcp_config.json` were invisible to both. They are leftovers
  // from an older layout and from the IDE, and this comment exists so nobody
  // "corrects" the segments below to point at one of them.
  //
  // `.gemini` alone would be the wrong detect directory — the Gemini CLI owns
  // it too, so it would report Antigravity as installed on a machine that only
  // ever ran Gemini. `.gemini/antigravity-cli` is agy's own state directory.
  antigravity: {
    configSegments: ['.gemini', 'config', 'mcp_config.json'],
    detectSegments: ['.gemini', 'antigravity-cli'],
    serversKey: 'mcpServers',
    label: 'Antigravity CLI',
    verified:
      'agy.exe on Windows, 2026-09-05 — wrote `{command,args,env}` with no `disabled` field into ' +
      '~/.gemini/config/mcp_config.json and `agy mcp list` reported it enabled'
  },

  'claude-desktop': undefined,
  cursor: undefined
}

/** The spec for a target, or `undefined` when this build does not offer it. */
export function targetSpec(target: McpClientTarget): McpTargetSpec | undefined {
  return MCP_TARGET_SPECS[target]
}
