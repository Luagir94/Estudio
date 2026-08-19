import path from 'node:path'
import { constants } from 'node:fs'

// Own PATH/PATHEXT walk, no shell (design D1 / spec "Windows Executable
// Resolution"). This module never spawns anything — resolution only.
// Spawning is the validator's job (PR2), the sole `child_process` site.

// Windows default when `PATHEXT` is unset (matches `cmd.exe`'s own
// fallback order). Real Windows always sets `PATHEXT`, so this only
// matters for a stripped-down `env`.
const DEFAULT_PATHEXT = ['.COM', '.EXE', '.BAT', '.CMD']

/**
 * The exact subset of `node:fs/promises` this module needs — narrow enough
 * to fake trivially in tests, wide enough that the real `access` can be
 * passed through unmodified.
 */
export interface ExecutableResolverFsPort {
  access(candidatePath: string, mode?: number): Promise<void>
}

export interface ExecutableResolverPorts {
  env: { PATH?: string; PATHEXT?: string }
  fs: ExecutableResolverFsPort
  /** Defaults to `process.platform` — injected so both branches are testable from either host OS. */
  platform?: NodeJS.Platform
}

/**
 * Resolves `name` to an absolute executable path by walking `PATH`.
 *
 * On win32, ONLY candidates built from a `PATHEXT` extension are ever
 * probed (`name.COM`, `name.EXE`, …, in `PATHEXT` order) — an
 * extension-less file is never constructed as a candidate at all, so it is
 * naturally excluded (design D1's "naturally excluded" claim, not a
 * filename special-case). On POSIX, a single extension-less candidate is
 * probed with `X_OK`.
 *
 * Returns `null` if `PATH` is empty or no directory yields an accessible
 * candidate — this function never throws for "not found".
 */
export async function resolveExecutable(
  name: string,
  { env, fs, platform = process.platform }: ExecutableResolverPorts
): Promise<string | null> {
  const delimiter = platform === 'win32' ? ';' : ':'
  const directories = (env.PATH ?? '').split(delimiter).filter((entry) => entry !== '')

  for (const directory of directories) {
    const candidates =
      platform === 'win32' ? windowsCandidates(directory, name, env.PATHEXT) : posixCandidates(directory, name)

    for (const candidate of candidates) {
      if (await isAccessible(fs, candidate.path, candidate.mode)) {
        return candidate.path
      }
    }
  }

  return null
}

function windowsCandidates(
  directory: string,
  name: string,
  pathext: string | undefined
): { path: string; mode?: number }[] {
  const extensions = (pathext ?? DEFAULT_PATHEXT.join(';')).split(';').filter((ext) => ext !== '')
  // `PATHEXT` is conventionally uppercase (`.CMD`); lowercase it so a
  // resolved path like `claude.cmd` matches the real shim's casing — the
  // filesystem itself is case-insensitive on win32, so this changes only
  // the displayed/returned string, never which file is found.
  return extensions.map((ext) => ({ path: path.join(directory, `${name}${ext.toLowerCase()}`) }))
}

function posixCandidates(directory: string, name: string): { path: string; mode?: number }[] {
  return [{ path: path.join(directory, name), mode: constants.X_OK }]
}

async function isAccessible(fs: ExecutableResolverFsPort, candidatePath: string, mode?: number): Promise<boolean> {
  try {
    await fs.access(candidatePath, mode)
    return true
  } catch {
    return false
  }
}
