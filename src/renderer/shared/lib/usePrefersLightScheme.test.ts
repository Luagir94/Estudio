// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrefersLightScheme } from './usePrefersLightScheme'

type ChangeListener = (event: MediaQueryListEvent) => void

// jsdom has no `matchMedia`, so the stub IS the environment: a minimal
// MediaQueryList that remembers its listeners and can flip at will —
// exactly what the OS does when the user switches appearance.
function stubMatchMedia(initialMatches: boolean): { flip: (matches: boolean) => void; queries: string[] } {
  const listeners = new Set<ChangeListener>()
  const queries: string[] = []
  let matches = initialMatches

  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    queries.push(query)
    return {
      get matches() {
        return matches
      },
      media: query,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener as ChangeListener)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener as ChangeListener)
      }
    } as MediaQueryList
  })

  return {
    flip: (next: boolean) => {
      matches = next
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent)
      }
    },
    queries
  }
}

describe('usePrefersLightScheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('subscribes to the light colour-scheme query', () => {
    const media = stubMatchMedia(false)

    renderHook(() => usePrefersLightScheme())

    expect(media.queries).toContain('(prefers-color-scheme: light)')
  })

  it('answers false when the OS asks for dark', () => {
    stubMatchMedia(false)

    const { result } = renderHook(() => usePrefersLightScheme())

    expect(result.current).toBe(false)
  })

  it('answers true when the OS asks for light', () => {
    stubMatchMedia(true)

    const { result } = renderHook(() => usePrefersLightScheme())

    expect(result.current).toBe(true)
  })

  it('re-renders when the OS preference flips', () => {
    const media = stubMatchMedia(false)

    const { result } = renderHook(() => usePrefersLightScheme())
    expect(result.current).toBe(false)

    act(() => media.flip(true))
    expect(result.current).toBe(true)

    act(() => media.flip(false))
    expect(result.current).toBe(false)
  })

  // Without the stub, `window.matchMedia` does not exist (real jsdom, any
  // pre-render). Dark is the app's default scheme, so that is the answer.
  it('answers false when matchMedia is unavailable', () => {
    const { result } = renderHook(() => usePrefersLightScheme())

    expect(result.current).toBe(false)
  })
})
