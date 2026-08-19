// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SIDEBAR_COLLAPSE_BREAKPOINT_PX,
  SIDEBAR_FORCED_RAIL_QUERY,
  readSidebarCollapsed,
  writeSidebarCollapsed
} from './sidebarPreference'

describe('sidebarPreference', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaults to expanded when nothing was ever stored', () => {
    expect(readSidebarCollapsed()).toBe(false)
  })

  it('round-trips the preference', () => {
    writeSidebarCollapsed(true)
    expect(readSidebarCollapsed()).toBe(true)

    writeSidebarCollapsed(false)
    expect(readSidebarCollapsed()).toBe(false)
  })

  // Storage can be unavailable (a hardened session, a full quota). Booting
  // into a degraded layout because of that would be the worse failure.
  it('answers expanded instead of throwing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(readSidebarCollapsed()).toBe(false)
  })

  it('swallows a failing write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => writeSidebarCollapsed(true)).not.toThrow()
  })

  // The query is what the App actually subscribes to, so an off-by-one here
  // would silently move the breakpoint.
  it('forces the rail strictly BELOW the breakpoint', () => {
    expect(SIDEBAR_FORCED_RAIL_QUERY).toBe(`(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT_PX - 1}px)`)
  })
})
