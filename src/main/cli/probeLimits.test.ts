import { describe, expect, it } from 'vitest'
import { CLI_PROBE_TIMEOUT_MS } from './probeLimits'

// This budget is not a taste call, so these assertions guard the measurement it
// was derived from rather than the number itself. See `probeLimits.ts` for the
// readings; what matters here is that a future tune keeps real headroom over a
// real cold start, and still cannot let a hung binary stall the screen forever.

/** The slowest real version probe observed while calibrating this budget. */
const SLOWEST_MEASURED_STARTUP_MS = 5_890

describe('CLI_PROBE_TIMEOUT_MS', () => {
  // The budget this replaced was 5000ms, which is BELOW this reading: it
  // reported a working codex as broken. Doubling is the margin a cold start
  // pays for — first run after boot, with an antivirus scanning the binary.
  it('leaves a cold start at least double the slowest measured CLI startup', () => {
    expect(CLI_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(SLOWEST_MEASURED_STARTUP_MS * 2)
  })

  // The other direction matters too: this timeout is the only thing that ends a
  // probe of a binary that never answers, and the user is watching a settings
  // screen while it runs.
  it('stays bounded, so a hung binary cannot stall the settings screen indefinitely', () => {
    expect(CLI_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})
