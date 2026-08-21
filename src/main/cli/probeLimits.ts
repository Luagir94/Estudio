// Shared budget for the two probes that spawn a CLI and wait for it to speak:
// the version probe (`cliProbeService.ts`) and the help probe
// (`capabilityProbe.ts`). ONE constant, because both measure the same physical
// thing — how long a CLI takes to boot on Windows — and two copies of that
// number drift apart the moment one is tuned.
//
// Deliberately separate from `ask/domain/limits.ts`: that file budgets a real
// question being answered by a model, which is a different order of magnitude
// and a different tuning question.

/**
 * Hard ceiling for a probe spawn — the process is killed and the provider
 * reported unusable if it is exceeded.
 *
 * Calibrated against real binaries rather than taste (Windows, warm cache,
 * 2026-08-20): `codex --version` 5190-5890ms, `claude --version` 4530-4654ms,
 * `codex exec --help` 4988ms, `agy --version` 376-1048ms.
 *
 * The previous budget was 5000ms, and every one of those readings indicts it:
 * codex was reported BROKEN despite working, claude cleared by ~350ms, and the
 * codex help page cleared by 12ms. Margins that thin are not margins — the
 * first run after a boot, with an antivirus scanning a 180MB binary, erases
 * them, so the screen would call a healthy CLI dead at random.
 *
 * Doubling the slowest reading buys that cold start. It stays bounded because
 * this timeout is the ONLY thing that ends a probe of a binary that never
 * answers, and a user is watching the settings screen while it runs.
 */
export const CLI_PROBE_TIMEOUT_MS = 15_000
