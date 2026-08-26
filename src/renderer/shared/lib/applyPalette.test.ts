// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPalette, applyStoredPalette, readStoredPalette } from './applyPalette'

function stubBridge(getPalette: () => unknown): void {
  Object.defineProperty(window, 'api', {
    value: { theme: { getPalette } },
    configurable: true,
    writable: true
  })
}

describe('applyPalette', () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette
  })

  it('puts the palette on the document element, where the stylesheet looks for it', () => {
    applyPalette('cobalto')

    expect(document.documentElement.getAttribute('data-palette')).toBe('cobalto')
  })

  // `amatista` has no override block in globals.css, so it resolves the same
  // with or without the attribute — but writing it keeps the DOM readable
  // instead of leaving the default indistinguishable from "not applied yet".
  it('writes the default like any other palette rather than clearing the attribute', () => {
    applyPalette('cuarzo')
    applyPalette('amatista')

    expect(document.documentElement.getAttribute('data-palette')).toBe('amatista')
  })

  it('replaces the previous palette instead of accumulating', () => {
    applyPalette('malva')
    applyPalette('grafito')

    expect(document.documentElement.getAttribute('data-palette')).toBe('grafito')
  })
})

describe('readStoredPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the persisted palette', async () => {
    stubBridge(vi.fn().mockResolvedValue({ ok: true, data: 'turquesa' }))

    await expect(readStoredPalette()).resolves.toBe('turquesa')
  })

  // This read happens before the first paint, where there is no screen to
  // report a failure on. Losing the chosen palette is the acceptable cost;
  // losing the app is not.
  it('degrades to the default when the envelope reports a failure', async () => {
    stubBridge(vi.fn().mockResolvedValue({ ok: false, error: { code: 'PALETTE_READ_FAILED', message: 'boom' } }))

    await expect(readStoredPalette()).resolves.toBe('amatista')
  })

  it('degrades to the default when the bridge itself rejects', async () => {
    stubBridge(vi.fn().mockRejectedValue(new Error('bridge gone')))

    await expect(readStoredPalette()).resolves.toBe('amatista')
  })

  // The value is about to become a DOM attribute, where an unrecognized one
  // paints the base palette without complaining. So it is parsed on this side
  // too, not trusted because the main side already parsed it.
  it('degrades to the default when the payload is outside the union', async () => {
    stubBridge(vi.fn().mockResolvedValue({ ok: true, data: 'violeta' }))

    await expect(readStoredPalette()).resolves.toBe('amatista')
  })
})

describe('applyStoredPalette', () => {
  afterEach(() => {
    delete document.documentElement.dataset.palette
  })

  it('applies what it read and reports it back', async () => {
    stubBridge(vi.fn().mockResolvedValue({ ok: true, data: 'grafito' }))

    await expect(applyStoredPalette()).resolves.toBe('grafito')
    expect(document.documentElement.getAttribute('data-palette')).toBe('grafito')
  })

  it('still applies a palette when the read fails, so boot never stalls unstyled', async () => {
    stubBridge(vi.fn().mockRejectedValue(new Error('bridge gone')))

    await expect(applyStoredPalette()).resolves.toBe('amatista')
    expect(document.documentElement.getAttribute('data-palette')).toBe('amatista')
  })
})
